package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/canfidelity/multicacan/server/internal/auth"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

// Daemon context keys.
type daemonContextKey int

const (
	ctxKeyDaemonWorkspaceID daemonContextKey = iota
	ctxKeyDaemonID
	ctxKeyDaemonAuthPath
)

// Daemon auth path labels exposed via context for slow-log attribution.
const (
	DaemonAuthPathDaemonToken = "daemon_token"
	DaemonAuthPathAgentTask   = "agent_task_token"
	DaemonAuthPathPAT         = "pat"
	DaemonAuthPathJWT         = "jwt"
)

// DaemonWorkspaceIDFromContext returns the workspace ID set by DaemonAuth middleware.
func DaemonWorkspaceIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(ctxKeyDaemonWorkspaceID).(string)
	return id
}

// DaemonIDFromContext returns the daemon ID set by DaemonAuth middleware.
func DaemonIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(ctxKeyDaemonID).(string)
	return id
}

// DaemonAuthPathFromContext returns which token kind authenticated this
// request — "daemon_token", "pat", or "jwt" — for telemetry. Empty when the
// request did not pass through DaemonAuth.
func DaemonAuthPathFromContext(ctx context.Context) string {
	p, _ := ctx.Value(ctxKeyDaemonAuthPath).(string)
	return p
}

// WithDaemonContext returns a new context with the daemon workspace ID and daemon ID set.
// This is used by tests to simulate daemon token authentication.
func WithDaemonContext(ctx context.Context, workspaceID, daemonID string) context.Context {
	ctx = context.WithValue(ctx, ctxKeyDaemonWorkspaceID, workspaceID)
	ctx = context.WithValue(ctx, ctxKeyDaemonID, daemonID)
	ctx = context.WithValue(ctx, ctxKeyDaemonAuthPath, DaemonAuthPathDaemonToken)
	return ctx
}

// DaemonAuth validates daemon auth tokens (mdt_ prefix) or falls back to
// JWT/PAT validation for backward compatibility with daemons that
// authenticate via user tokens.
//
// Both caches are optional. When non-nil:
//   - daemonCache short-circuits the daemon_token DB lookup on the mdt_ path
//   - patCache short-circuits the PAT DB lookup AND the last_used_at update
//     on the mul_ fallback path. This is the same cache shared with the
//     regular Auth middleware, so a single hot PAT used by both human CLI
//     and a daemon converges on one DB round-trip per AuthCacheTTL window.
//
// Cache misses fall back to the original DB-backed behavior.
func DaemonAuth(queries *db.Queries, patCache *auth.PATCache, daemonCache *auth.DaemonTokenCache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				slog.Debug("daemon_auth: missing authorization header", "path", r.URL.Path)
				writeError(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				slog.Debug("daemon_auth: invalid format", "path", r.URL.Path)
				writeError(w, http.StatusUnauthorized, "invalid authorization format")
				return
			}

			// Agent task token: "mat_" prefix. Minted at claim time and injected
			// into the agent process as MULTICACAN_TOKEN. Validated against the
			// task_token table; workspace ID is carried on the token row.
			if strings.HasPrefix(tokenString, "mat_") {
				if queries == nil {
					writeError(w, http.StatusUnauthorized, "invalid token")
					return
				}
				tt, err := queries.GetTaskTokenByHash(r.Context(), auth.HashToken(tokenString))
				if err != nil {
					slog.Warn("daemon_auth: invalid agent task token", "path", r.URL.Path, "error", err)
					writeError(w, http.StatusUnauthorized, "invalid token")
					return
				}
				if tt.ExpiresAt.Valid && time.Now().After(tt.ExpiresAt.Time) {
					writeError(w, http.StatusUnauthorized, "token expired")
					return
				}
				wsID := uuidToString(tt.WorkspaceID)
				ctx := context.WithValue(r.Context(), ctxKeyDaemonWorkspaceID, wsID)
				ctx = context.WithValue(ctx, ctxKeyDaemonAuthPath, DaemonAuthPathAgentTask)
				// Surface the acting user so ownership checks work normally.
				r.Header.Set("X-User-ID", uuidToString(tt.UserID))
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Daemon token: "mdt_" prefix.
			if strings.HasPrefix(tokenString, "mdt_") {
				hash := auth.HashToken(tokenString)

				if id, ok := daemonCache.Get(r.Context(), hash); ok {
					ctx := context.WithValue(r.Context(), ctxKeyDaemonWorkspaceID, id.WorkspaceID)
					ctx = context.WithValue(ctx, ctxKeyDaemonID, id.DaemonID)
					ctx = context.WithValue(ctx, ctxKeyDaemonAuthPath, DaemonAuthPathDaemonToken)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}

				if queries == nil {
					writeError(w, http.StatusUnauthorized, "invalid daemon token")
					return
				}
				dt, err := queries.GetDaemonTokenByHash(r.Context(), hash)
				if err != nil {
					slog.Warn("daemon_auth: invalid daemon token", "path", r.URL.Path, "error", err)
					writeError(w, http.StatusUnauthorized, "invalid daemon token")
					return
				}

				identity := auth.DaemonTokenIdentity{
					WorkspaceID: uuidToString(dt.WorkspaceID),
					DaemonID:    dt.DaemonID,
				}
				// daemon_token.expires_at is NOT NULL; pgtype Valid is true
				// in normal operation, but defend against zero just in case.
				var expiresAt time.Time
				if dt.ExpiresAt.Valid {
					expiresAt = dt.ExpiresAt.Time
				}
				daemonCache.Set(r.Context(), hash, identity, auth.TTLForExpiry(time.Now(), expiresAt))

				ctx := context.WithValue(r.Context(), ctxKeyDaemonWorkspaceID, identity.WorkspaceID)
				ctx = context.WithValue(ctx, ctxKeyDaemonID, identity.DaemonID)
				ctx = context.WithValue(ctx, ctxKeyDaemonAuthPath, DaemonAuthPathDaemonToken)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Fallback: PAT tokens ("mul_" prefix).
			if strings.HasPrefix(tokenString, "mul_") {
				hash := auth.HashToken(tokenString)

				if userID, ok := patCache.Get(r.Context(), hash); ok {
					r.Header.Set("X-User-ID", userID)
					ctx := context.WithValue(r.Context(), ctxKeyDaemonAuthPath, DaemonAuthPathPAT)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}

				if queries == nil {
					writeError(w, http.StatusUnauthorized, "invalid token")
					return
				}
				pat, err := queries.GetPersonalAccessTokenByHash(r.Context(), hash)
				if err != nil {
					slog.Warn("daemon_auth: invalid PAT", "path", r.URL.Path, "error", err)
					writeError(w, http.StatusUnauthorized, "invalid token")
					return
				}

				userID := uuidToString(pat.UserID)
				r.Header.Set("X-User-ID", userID)

				var expiresAt time.Time
				if pat.ExpiresAt.Valid {
					expiresAt = pat.ExpiresAt.Time
				}
				patCache.Set(r.Context(), hash, userID, auth.TTLForExpiry(time.Now(), expiresAt))

				// Cache miss = first request in this TTL window. Refresh
				// last_used_at; subsequent hits skip the write entirely.
				go queries.UpdatePersonalAccessTokenLastUsed(context.Background(), pat.ID)

				ctx := context.WithValue(r.Context(), ctxKeyDaemonAuthPath, DaemonAuthPathPAT)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			// Fallback: JWT tokens.
			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return auth.JWTSecret(), nil
			})
			if err != nil || !token.Valid {
				slog.Warn("daemon_auth: invalid token", "path", r.URL.Path, "error", err)
				writeError(w, http.StatusUnauthorized, "invalid token")
				return
			}

			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				writeError(w, http.StatusUnauthorized, "invalid claims")
				return
			}
			sub, ok := claims["sub"].(string)
			if !ok || strings.TrimSpace(sub) == "" {
				writeError(w, http.StatusUnauthorized, "invalid claims")
				return
			}
			r.Header.Set("X-User-ID", sub)
			ctx := context.WithValue(r.Context(), ctxKeyDaemonAuthPath, DaemonAuthPathJWT)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
