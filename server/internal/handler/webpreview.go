package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// WebPreviewRelayHub stores relay connections keyed by "workspaceID:port".
type WebPreviewRelayHub struct {
	mu    sync.Mutex
	conns map[string]*webPreviewRelay
}

type webPreviewRelay struct {
	ws      *websocket.Conn
	writeMu sync.Mutex
	port    int

	pendingMu sync.Mutex
	pending   map[string]chan webPreviewHTTPResponse
}

type webPreviewHTTPResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"` // base64
}

func NewWebPreviewRelayHub() *WebPreviewRelayHub {
	return &WebPreviewRelayHub{conns: make(map[string]*webPreviewRelay)}
}

func (h *WebPreviewRelayHub) Register(workspaceID string, ws *websocket.Conn, port int) *webPreviewRelay {
	rc := &webPreviewRelay{ws: ws, port: port, pending: make(map[string]chan webPreviewHTTPResponse)}
	key := fmt.Sprintf("%s:%d", workspaceID, port)
	h.mu.Lock()
	if prev, ok := h.conns[key]; ok {
		prev.writeMu.Lock()
		prev.ws.Close()
		prev.writeMu.Unlock()
	}
	h.conns[key] = rc
	h.mu.Unlock()
	return rc
}

// GetByPort returns the relay for a specific workspace+port.
func (h *WebPreviewRelayHub) GetByPort(workspaceID string, port int) *webPreviewRelay {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.conns[fmt.Sprintf("%s:%d", workspaceID, port)]
}

// ListPorts returns all active ports for a workspace, sorted ascending.
func (h *WebPreviewRelayHub) ListPorts(workspaceID string) []int {
	h.mu.Lock()
	defer h.mu.Unlock()
	prefix := workspaceID + ":"
	var ports []int
	for key, _ := range h.conns {
		if strings.HasPrefix(key, prefix) {
			var port int
			fmt.Sscanf(strings.TrimPrefix(key, prefix), "%d", &port)
			ports = append(ports, port)
		}
	}
	sort.Ints(ports)
	return ports
}

func (h *WebPreviewRelayHub) Unregister(workspaceID string, rc *webPreviewRelay) {
	key := fmt.Sprintf("%s:%d", workspaceID, rc.port)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[key] == rc {
		delete(h.conns, key)
	}
}

func (rc *webPreviewRelay) addPending(id string, ch chan webPreviewHTTPResponse) {
	rc.pendingMu.Lock()
	rc.pending[id] = ch
	rc.pendingMu.Unlock()
}

func (rc *webPreviewRelay) removePending(id string) {
	rc.pendingMu.Lock()
	delete(rc.pending, id)
	rc.pendingMu.Unlock()
}

func (rc *webPreviewRelay) dispatch(id string, res webPreviewHTTPResponse) {
	rc.pendingMu.Lock()
	ch := rc.pending[id]
	rc.pendingMu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- res:
	default:
	}
}

func (rc *webPreviewRelay) writeJSON(v any) error {
	rc.writeMu.Lock()
	defer rc.writeMu.Unlock()
	return rc.ws.WriteJSON(v)
}

// WebPreviewRelayRegister handles daemon → server relay WebSocket.
// GET /api/webpreview/relay?workspace_id=X&port=3000   (daemon auth)
func (h *Handler) WebPreviewRelayRegister(w http.ResponseWriter, r *http.Request) {
	if h.WebPreviewRelays == nil {
		writeError(w, http.StatusServiceUnavailable, "web preview relay disabled")
		return
	}
	workspaceID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id required")
		return
	}
	port := 3000
	fmt.Sscanf(r.URL.Query().Get("port"), "%d", &port)

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("webpreview relay: upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	rc := h.WebPreviewRelays.Register(workspaceID, conn, port)
	defer h.WebPreviewRelays.Unregister(workspaceID, rc)

	slog.Info("webpreview relay: daemon connected", "workspace_id", workspaceID, "port", port)

	// Keepalive: ping every 30s so the relay stays alive through proxies/load-balancers.
	done := make(chan struct{})
	defer close(done)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				rc.writeMu.Lock()
				rc.ws.WriteMessage(websocket.PingMessage, nil)
				rc.writeMu.Unlock()
			}
		}
	}()
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			slog.Info("webpreview relay: daemon disconnected", "workspace_id", workspaceID, "port", port)
			return
		}
		var envelope struct {
			Type string `json:"type"`
			ID   string `json:"id"`
			webPreviewHTTPResponse
		}
		if err := json.Unmarshal(data, &envelope); err != nil || envelope.Type != "res" || envelope.ID == "" {
			continue
		}
		rc.dispatch(envelope.ID, envelope.webPreviewHTTPResponse)
	}
}

// WebPreviewStatus returns all relay ports for the caller's workspace.
// GET /api/webpreview/status   (user auth, workspace from context or query param)
func (h *Handler) WebPreviewStatus(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspaceID(r.Context())
	if wsID == "" {
		wsID = r.URL.Query().Get("workspace_id")
	}
	if h.WebPreviewRelays == nil || wsID == "" {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	ports := h.WebPreviewRelays.ListPorts(wsID)
	result := make([]map[string]any, 0, len(ports))
	for _, p := range ports {
		result = append(result, map[string]any{"port": p})
	}
	writeJSON(w, http.StatusOK, result)
}

// absPathRe matches src, href, action attributes that reference absolute paths.
var absPathRe = regexp.MustCompile(`(src|href|action)="(/[^"]*)"`)

// rewriteHTML rewrites absolute paths so they go through the proxy prefix.
func rewriteHTML(body []byte, proxyPrefix string) []byte {
	html := string(body)
	html = absPathRe.ReplaceAllStringFunc(html, func(match string) string {
		if strings.Contains(match, proxyPrefix) {
			return match
		}
		return absPathRe.ReplaceAllString(match, `$1="`+proxyPrefix+`$2"`)
	})
	patch := fmt.Sprintf(`<script>(function(){var P=%q;var f=window.fetch;window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith(P))u=P+u.slice(1);return f.call(this,u,o)};var X=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string'&&u.startsWith('/')&&!u.startsWith(P))u=P+u.slice(1);return X.call(this,m,u,...[].slice.call(arguments,2))}})()</script>`, proxyPrefix)
	html = strings.Replace(html, "</head>", patch+"</head>", 1)
	return []byte(html)
}

// WebPreviewProxy tunnels a request through the relay for the given workspace+port.
// GET /api/webpreview/{workspaceId}/{port}/*
func (h *Handler) WebPreviewProxy(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	if workspaceID == "" {
		workspaceID = ctxWorkspaceID(r.Context())
	}
	portStr := chi.URLParam(r, "port")
	port := 0
	fmt.Sscanf(portStr, "%d", &port)

	if h.WebPreviewRelays == nil || workspaceID == "" || port == 0 {
		writeError(w, http.StatusBadRequest, "workspaceId and port required")
		return
	}
	rc := h.WebPreviewRelays.GetByPort(workspaceID, port)
	if rc == nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprintf(w, "<html><body style='font-family:sans-serif;padding:2rem'><h2>No relay for port %d</h2></body></html>", port)
		return
	}

	path := chi.URLParam(r, "*")
	if path == "" {
		path = "/"
	} else if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	reqID := randomID()
	ch := make(chan webPreviewHTTPResponse, 1)
	rc.addPending(reqID, ch)
	defer rc.removePending(reqID)

	hdrs := map[string]string{
		"Accept":          r.Header.Get("Accept"),
		"Accept-Language": r.Header.Get("Accept-Language"),
		"Cache-Control":   r.Header.Get("Cache-Control"),
	}
	if err := rc.writeJSON(map[string]any{
		"type":    "req",
		"id":      reqID,
		"method":  r.Method,
		"path":    path,
		"query":   r.URL.RawQuery,
		"headers": hdrs,
	}); err != nil {
		writeError(w, http.StatusBadGateway, "relay write failed")
		return
	}

	select {
	case res := <-ch:
		body, err := base64.StdEncoding.DecodeString(res.Body)
		if err != nil {
			writeError(w, http.StatusBadGateway, "response decode failed")
			return
		}
		ct := res.Headers["Content-Type"]
		if ct == "" {
			ct = res.Headers["content-type"]
		}
		proxyPrefix := fmt.Sprintf("/api/webpreview/%s/%d/", workspaceID, port)
		if strings.Contains(ct, "text/html") {
			body = rewriteHTML(body, proxyPrefix)
			res.Headers["Content-Length"] = fmt.Sprintf("%d", len(body))
		}
		if strings.Contains(ct, "text/css") {
			css := strings.ReplaceAll(string(body), "url(/", "url("+proxyPrefix)
			body = []byte(css)
		}
		for k, v := range res.Headers {
			lower := strings.ToLower(k)
			if lower == "content-encoding" || lower == "transfer-encoding" ||
				lower == "content-security-policy" || lower == "x-frame-options" {
				continue
			}
			w.Header().Set(k, v)
		}
		// Remove middleware-injected headers that would block iframe embedding.
		w.Header().Del("Content-Security-Policy")
		w.Header().Del("X-Frame-Options")
		w.WriteHeader(res.Status)
		w.Write(body)

	case <-time.After(30 * time.Second):
		writeError(w, http.StatusGatewayTimeout, "web preview timeout")
	case <-r.Context().Done():
	}
}
