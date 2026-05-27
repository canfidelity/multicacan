package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

// OutboundWebhookService delivers events to externally registered HTTP endpoints.
type OutboundWebhookService struct {
	Queries    *db.Queries
	HTTPClient *http.Client
}

func NewOutboundWebhookService(queries *db.Queries) *OutboundWebhookService {
	return &OutboundWebhookService{
		Queries: queries,
		HTTPClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Deliver sends event+payload to all active webhooks subscribed to the event.
// Each delivery is fire-and-forget in a goroutine; the caller is not blocked.
func (s *OutboundWebhookService) Deliver(workspaceID pgtype.UUID, event string, payload any) {
	wsID := workspaceID

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("outbound webhook: marshal payload failed", "event", event, "error", err)
		return
	}

	go func() {
		// Use a long-lived context for the goroutine so retry backoffs
		// (up to 30 min) are not cancelled by a short per-request timeout.
		// Individual HTTP calls inside deliver use their own short timeouts.
		ctx := context.Background()

		listCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		hooks, err := s.Queries.ListActiveOutboundWebhooksForEvent(listCtx, db.ListActiveOutboundWebhooksForEventParams{
			WorkspaceID: wsID,
			Column2:     event,
		})
		cancel()
		if err != nil {
			slog.Warn("outbound webhook: list hooks failed", "event", event, "error", err)
			return
		}

		for _, hook := range hooks {
			s.deliver(ctx, hook, event, payloadBytes)
		}
	}()
}

// retryBackoffs defines the wait durations between delivery attempts.
// A delivery is attempted once immediately, then up to len(retryBackoffs)
// more times on failure — giving maxAttempts = 1 + len(retryBackoffs).
var retryBackoffs = []time.Duration{
	1 * time.Minute,
	5 * time.Minute,
	30 * time.Minute,
}

func (s *OutboundWebhookService) deliver(ctx context.Context, hook db.OutboundWebhook, event string, payload []byte) {
	delivery, err := s.Queries.CreateOutboundWebhookDelivery(ctx, db.CreateOutboundWebhookDeliveryParams{
		WebhookID: hook.ID,
		Event:     event,
		Payload:   payload,
		Status:    "pending",
	})
	if err != nil {
		slog.Warn("outbound webhook: create delivery record failed", "webhook_id", hook.ID, "error", err)
		return
	}

	var (
		statusCode  int
		deliveryErr error
	)

	// First attempt (not counted as a retry).
	statusCode, deliveryErr = s.post(hook, event, payload)

	// Retry with exponential backoff on failure.
	for i, backoff := range retryBackoffs {
		if deliveryErr == nil {
			break
		}
		slog.Warn("outbound webhook: delivery failed, will retry",
			"webhook_id", hook.ID,
			"event", event,
			"url", hook.Url,
			"attempt", i+1,
			"backoff", backoff,
			"error", deliveryErr,
		)

		// Mark delivery as retrying so callers can see we are still trying.
		if uErr := s.Queries.UpdateOutboundWebhookDelivery(ctx, db.UpdateOutboundWebhookDeliveryParams{
			ID:         delivery.ID,
			Status:     "retrying",
			StatusCode: pgtype.Int4{Int32: int32(statusCode), Valid: statusCode > 0},
			Error:      pgtype.Text{String: deliveryErr.Error(), Valid: true},
		}); uErr != nil {
			slog.Warn("outbound webhook: update delivery retrying status failed", "delivery_id", delivery.ID, "error", uErr)
		}

		select {
		case <-ctx.Done():
			deliveryErr = ctx.Err()
			break
		case <-time.After(backoff):
		}

		statusCode, deliveryErr = s.post(hook, event, payload)
	}

	status := "delivered"
	errStr := pgtype.Text{}
	if deliveryErr != nil {
		status = "failed"
		errStr = pgtype.Text{String: deliveryErr.Error(), Valid: true}
		slog.Warn("outbound webhook: delivery failed after all retries", "webhook_id", hook.ID, "event", event, "url", hook.Url, "error", deliveryErr)
	}

	if err := s.Queries.UpdateOutboundWebhookDelivery(ctx, db.UpdateOutboundWebhookDeliveryParams{
		ID:         delivery.ID,
		Status:     status,
		StatusCode: pgtype.Int4{Int32: int32(statusCode), Valid: statusCode > 0},
		Error:      errStr,
	}); err != nil {
		slog.Warn("outbound webhook: update delivery record failed", "delivery_id", delivery.ID, "error", err)
	}
}

func (s *OutboundWebhookService) post(hook db.OutboundWebhook, event string, payload []byte) (int, error) {
	body := map[string]any{
		"event":     event,
		"payload":   json.RawMessage(payload),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return 0, fmt.Errorf("marshal body: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, hook.Url, bytes.NewReader(bodyBytes))
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Multicacan-Event", event)

	if hook.Secret.Valid && hook.Secret.String != "" {
		mac := hmac.New(sha256.New, []byte(hook.Secret.String))
		mac.Write(bodyBytes)
		req.Header.Set("X-Multicacan-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	resp, err := s.HTTPClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return resp.StatusCode, fmt.Errorf("non-2xx response: %d", resp.StatusCode)
	}
	return resp.StatusCode, nil
}
