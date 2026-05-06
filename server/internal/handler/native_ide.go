package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// NativeIDERelayHub manages daemon relay connections for the native IDE.
// Key: workspaceID.
type NativeIDERelayHub struct {
	mu    sync.Mutex
	conns map[string]*nativeIDERelay
}

func NewNativeIDERelayHub() *NativeIDERelayHub {
	return &NativeIDERelayHub{conns: make(map[string]*nativeIDERelay)}
}

func (h *NativeIDERelayHub) register(wsID string, conn *websocket.Conn) *nativeIDERelay {
	rc := &nativeIDERelay{
		ws:       conn,
		pending:  make(map[string]chan nativeIDEFSResponse),
		ptyConns: make(map[string]chan []byte),
		ideChats: make(map[string]chan nativeIDEChatEvent),
	}
	h.mu.Lock()
	h.conns[wsID] = rc
	h.mu.Unlock()
	return rc
}

func (h *NativeIDERelayHub) unregister(wsID string) {
	h.mu.Lock()
	delete(h.conns, wsID)
	h.mu.Unlock()
}

func (h *NativeIDERelayHub) get(wsID string) *nativeIDERelay {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.conns[wsID]
}

func (h *NativeIDERelayHub) hasAny(wsID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.conns[wsID]
	return ok
}

type nativeIDERelay struct {
	ws      *websocket.Conn
	writeMu sync.Mutex

	pendingMu sync.Mutex
	pending   map[string]chan nativeIDEFSResponse

	ptyConnsMu sync.Mutex
	ptyConns   map[string]chan []byte

	ideChatMu sync.Mutex
	ideChats   map[string]chan nativeIDEChatEvent
}

type nativeIDEFSResponse struct {
	Entries []NativeIDEEntry `json:"entries,omitempty"`
	Content string           `json:"content,omitempty"`
	Error   string           `json:"error,omitempty"`
}

type nativeIDEChatEvent struct {
	Type    string
	Text    string
	Tool    string
	Input   json.RawMessage
	Content string
	Message string
}

type NativeIDEEntry struct {
	Name string `json:"name"`
	Dir  bool   `json:"dir"`
	Size int64  `json:"size"`
}

func (rc *nativeIDERelay) writeJSON(v any) error {
	rc.writeMu.Lock()
	defer rc.writeMu.Unlock()
	return rc.ws.WriteJSON(v)
}

func (rc *nativeIDERelay) addPending(id string) chan nativeIDEFSResponse {
	ch := make(chan nativeIDEFSResponse, 1)
	rc.pendingMu.Lock()
	rc.pending[id] = ch
	rc.pendingMu.Unlock()
	return ch
}

func (rc *nativeIDERelay) removePending(id string) {
	rc.pendingMu.Lock()
	delete(rc.pending, id)
	rc.pendingMu.Unlock()
}

func (rc *nativeIDERelay) dispatchFS(id string, res nativeIDEFSResponse) {
	rc.pendingMu.Lock()
	ch := rc.pending[id]
	rc.pendingMu.Unlock()
	if ch != nil {
		select {
		case ch <- res:
		default:
		}
	}
}

func (rc *nativeIDERelay) addPTY(id string) chan []byte {
	ch := make(chan []byte, 64)
	rc.ptyConnsMu.Lock()
	rc.ptyConns[id] = ch
	rc.ptyConnsMu.Unlock()
	return ch
}

func (rc *nativeIDERelay) removePTY(id string, ch chan []byte) {
	rc.ptyConnsMu.Lock()
	if rc.ptyConns[id] == ch {
		delete(rc.ptyConns, id)
		rc.ptyConnsMu.Unlock()
		close(ch)
	} else {
		rc.ptyConnsMu.Unlock()
	}
}

func (rc *nativeIDERelay) dispatchPTY(id string, data []byte) {
	rc.ptyConnsMu.Lock()
	ch := rc.ptyConns[id]
	rc.ptyConnsMu.Unlock()
	if ch != nil {
		select {
		case ch <- data:
		default:
		}
	}
}

func (rc *nativeIDERelay) dispatchIDEChat(id string, ev nativeIDEChatEvent) {
	rc.ideChatMu.Lock()
	ch := rc.ideChats[id]
	rc.ideChatMu.Unlock()
	if ch != nil {
		select {
		case ch <- ev:
		default:
		}
	}
}

// NativeIDERelayRegister handles daemon → VPS relay WebSocket.
// GET /api/native-ide/relay   (daemon auth)
func (h *Handler) NativeIDERelayRegister(w http.ResponseWriter, r *http.Request) {
	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		http.Error(w, "workspace_id required", http.StatusBadRequest)
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Debug("native ide relay: upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	rc := h.NativeIDERelays.register(wsID, conn)
	defer h.NativeIDERelays.unregister(wsID)

	slog.Info("native ide relay: daemon connected", "workspace_id", wsID)

	done := make(chan struct{})
	defer close(done)
	go func() {
		tick := time.NewTicker(30 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-done:
				return
			case <-tick.C:
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

	type envelope struct {
		Type      string           `json:"type"`
		ID        string           `json:"id"`
		Entries   []NativeIDEEntry `json:"entries,omitempty"`
		Content   string           `json:"content,omitempty"`
		Error     string           `json:"error,omitempty"`
		Data      string           `json:"data,omitempty"`    // pty_output: base64
		Text      string           `json:"text,omitempty"`
		Tool      string           `json:"tool,omitempty"`
		Input     json.RawMessage  `json:"input,omitempty"`
		ErrMsg    string           `json:"message,omitempty"`
		SessionID string           `json:"session_id,omitempty"`
	}

	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			slog.Debug("native ide relay: read error", "workspace_id", wsID, "error", err)
			return
		}

		var env envelope
		if err := json.Unmarshal(raw, &env); err != nil || env.ID == "" {
			continue
		}

		switch env.Type {
		case "fs_res":
			rc.dispatchFS(env.ID, nativeIDEFSResponse{
				Entries: env.Entries,
				Content: env.Content,
				Error:   env.Error,
			})
		case "pty_output":
			if env.Data != "" {
				data, err := base64.StdEncoding.DecodeString(env.Data)
				if err == nil {
					rc.dispatchPTY(env.ID, data)
				}
			}
		case "pty_closed":
			// PTY process died on daemon — close the output channel unconditionally.
			rc.ptyConnsMu.Lock()
			if ch, ok := rc.ptyConns[env.ID]; ok {
				delete(rc.ptyConns, env.ID)
				close(ch)
			}
			rc.ptyConnsMu.Unlock()
		case "ide_chat_delta":
			rc.dispatchIDEChat(env.ID, nativeIDEChatEvent{Type: "ide_chat_delta", Text: env.Text})
		case "ide_chat_tool_call":
			rc.dispatchIDEChat(env.ID, nativeIDEChatEvent{Type: "ide_chat_tool_call", Tool: env.Tool, Input: env.Input})
		case "ide_chat_tool_result":
			rc.dispatchIDEChat(env.ID, nativeIDEChatEvent{Type: "ide_chat_tool_result", Tool: env.Tool, Content: env.Content})
		case "ide_chat_done":
			rc.dispatchIDEChat(env.ID, nativeIDEChatEvent{Type: "ide_chat_done", Message: env.SessionID})
		case "ide_chat_error":
			rc.dispatchIDEChat(env.ID, nativeIDEChatEvent{Type: "ide_chat_error", Message: env.ErrMsg})
		}
	}
}

// NativeIDEStatus reports whether a relay is connected for the given workspace.
// GET /api/native-ide/status?workspace_id=X
func (h *Handler) NativeIDEStatus(w http.ResponseWriter, r *http.Request) {
	wsID := r.URL.Query().Get("workspace_id")
	active := wsID != "" && h.NativeIDERelays.hasAny(wsID)
	writeJSON(w, http.StatusOK, map[string]any{"active": active})
}

// NativeIDEFiles lists a directory via the relay.
// GET /api/native-ide/{workspaceId}/files?path=/
func (h *Handler) NativeIDEFiles(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	rc := h.NativeIDERelays.get(wsID)
	if rc == nil {
		http.Error(w, "IDE relay not connected", http.StatusServiceUnavailable)
		return
	}

	id := randomID()
	ch := rc.addPending(id)
	defer rc.removePending(id)

	if err := rc.writeJSON(map[string]any{"type": "fs_list", "id": id, "path": path}); err != nil {
		http.Error(w, "relay write error", http.StatusBadGateway)
		return
	}

	select {
	case res := <-ch:
		if res.Error != "" {
			http.Error(w, res.Error, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": res.Entries})
	case <-time.After(10 * time.Second):
		http.Error(w, "relay timeout", http.StatusGatewayTimeout)
	case <-r.Context().Done():
	}
}

// NativeIDEFile handles file read, write, and delete via the relay.
// GET|PUT|DELETE /api/native-ide/{workspaceId}/file?path=...
func (h *Handler) NativeIDEFile(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}

	rc := h.NativeIDERelays.get(wsID)
	if rc == nil {
		http.Error(w, "IDE relay not connected", http.StatusServiceUnavailable)
		return
	}

	id := randomID()
	ch := rc.addPending(id)
	defer rc.removePending(id)

	var msg map[string]any
	switch r.Method {
	case http.MethodGet:
		msg = map[string]any{"type": "fs_read", "id": id, "path": path}
	case http.MethodPut:
		body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20)) // 10 MB limit
		if err != nil {
			http.Error(w, "read body error", http.StatusBadRequest)
			return
		}
		msg = map[string]any{
			"type":    "fs_write",
			"id":      id,
			"path":    path,
			"content": base64.StdEncoding.EncodeToString(body),
		}
	case http.MethodDelete:
		msg = map[string]any{"type": "fs_delete", "id": id, "path": path}
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := rc.writeJSON(msg); err != nil {
		http.Error(w, "relay write error", http.StatusBadGateway)
		return
	}

	select {
	case res := <-ch:
		if res.Error != "" {
			http.Error(w, res.Error, http.StatusInternalServerError)
			return
		}
		if r.Method == http.MethodGet {
			writeJSON(w, http.StatusOK, map[string]any{"content": res.Content})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case <-time.After(15 * time.Second):
		http.Error(w, "relay timeout", http.StatusGatewayTimeout)
	case <-r.Context().Done():
	}
}

// NativeIDERename renames a file or directory via the relay.
// POST /api/native-ide/{workspaceId}/rename?from=...&to=...
func (h *Handler) NativeIDERename(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if from == "" || to == "" {
		http.Error(w, "from and to required", http.StatusBadRequest)
		return
	}

	rc := h.NativeIDERelays.get(wsID)
	if rc == nil {
		http.Error(w, "IDE relay not connected", http.StatusServiceUnavailable)
		return
	}

	id := randomID()
	ch := rc.addPending(id)
	defer rc.removePending(id)

	if err := rc.writeJSON(map[string]any{"type": "fs_rename", "id": id, "from": from, "to": to}); err != nil {
		http.Error(w, "relay write error", http.StatusBadGateway)
		return
	}

	select {
	case res := <-ch:
		if res.Error != "" {
			http.Error(w, res.Error, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case <-time.After(10 * time.Second):
		http.Error(w, "relay timeout", http.StatusGatewayTimeout)
	case <-r.Context().Done():
	}
}

// NativeIDETerminal opens or reattaches to a PTY session via the relay as a WebSocket.
// GET /api/native-ide/{workspaceId}/terminal?pty_id=<id>  (WebSocket upgrade)
// If pty_id is provided the daemon reattaches to the existing session; otherwise a new PTY is created.
func (h *Handler) NativeIDETerminal(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	existingPtyID := r.URL.Query().Get("pty_id")

	rc := h.NativeIDERelays.get(wsID)
	if rc == nil {
		http.Error(w, "IDE relay not connected", http.StatusServiceUnavailable)
		return
	}

	var ptyID string
	var isNew bool
	if existingPtyID != "" {
		ptyID = existingPtyID
		isNew = false
	} else {
		ptyID = randomID()
		isNew = true
	}

	outputCh := rc.addPTY(ptyID)
	defer rc.removePTY(ptyID, outputCh)

	if isNew {
		if err := rc.writeJSON(map[string]any{
			"type": "pty_open",
			"id":   ptyID,
			"cols": 80,
			"rows": 24,
		}); err != nil {
			http.Error(w, "relay write error", http.StatusBadGateway)
			return
		}
	} else {
		if err := rc.writeJSON(map[string]any{
			"type": "pty_reattach",
			"id":   ptyID,
		}); err != nil {
			http.Error(w, "relay write error", http.StatusBadGateway)
			return
		}
	}

	browserConn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Debug("native ide terminal: browser upgrade failed", "error", err)
		_ = rc.writeJSON(map[string]any{"type": "pty_detach", "id": ptyID})
		return
	}
	defer browserConn.Close()
	// Always detach (not close) when browser disconnects — PTY stays alive for reconnect.
	defer func() { _ = rc.writeJSON(map[string]any{"type": "pty_detach", "id": ptyID}) }()

	var browserWriteMu sync.Mutex

	// Daemon → browser: forward PTY output.
	go func() {
		for data := range outputCh {
			browserWriteMu.Lock()
			browserConn.WriteMessage(websocket.BinaryMessage, data)
			browserWriteMu.Unlock()
		}
	}()

	// Browser → daemon: forward input / resize.
	for {
		msgType, data, err := browserConn.ReadMessage()
		if err != nil {
			return
		}

		if msgType == websocket.TextMessage {
			// Resize or explicit close: {"cols":N,"rows":M} or {"type":"close"}
			var textMsg struct {
				Type string `json:"type"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
			}
			if json.Unmarshal(data, &textMsg) == nil {
				if textMsg.Type == "close" {
					// Browser explicitly closed — kill the PTY.
					_ = rc.writeJSON(map[string]any{"type": "pty_close", "id": ptyID})
					return
				}
				if textMsg.Cols > 0 && textMsg.Rows > 0 {
					_ = rc.writeJSON(map[string]any{
						"type": "pty_resize",
						"id":   ptyID,
						"cols": textMsg.Cols,
						"rows": textMsg.Rows,
					})
					continue
				}
			}
		}

		_ = rc.writeJSON(map[string]any{
			"type": "pty_input",
			"id":   ptyID,
			"data": base64.StdEncoding.EncodeToString(data),
		})
	}
}

// ── IDE Streaming Chat ────────────────────────────────────────────────────

type IDEChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// NativeIDERuntimes returns online (non-hermes) runtimes available for IDE chat.
// GET /api/native-ide/{workspaceId}/runtimes
func (h *Handler) NativeIDERuntimes(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")
	wsUUID := parseUUID(wsID)

	runtimes, err := h.Queries.ListAgentRuntimes(r.Context(), wsUUID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	type runtimeInfo struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Provider string `json:"provider"`
	}
	result := []runtimeInfo{}
	// Preferred providers for IDE inline chat (no Multica task creation).
	allowed := map[string]bool{"claude": true, "opencode": true, "codex": true}
	for _, rt := range runtimes {
		if rt.Status != "online" {
			continue
		}
		if !allowed[rt.Provider] {
			continue
		}
		result = append(result, runtimeInfo{
			ID:       uuidToString(rt.ID),
			Name:     rt.Name,
			Provider: rt.Provider,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"runtimes": result})
}

// NativeIDEChatStream streams AI responses for the IDE chat panel.
// POST /api/native-ide/{workspaceId}/chat/stream
func (h *Handler) NativeIDEChatStream(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "workspaceId")

	var req struct {
		RuntimeID string           `json:"runtime_id"`
		SessionID string           `json:"session_id"`
		Messages  []IDEChatMessage `json:"messages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(req.Messages) == 0 {
		http.Error(w, "messages required", http.StatusBadRequest)
		return
	}
	if req.RuntimeID == "" || req.RuntimeID == "00000000-0000-0000-0000-000000000000" {
		http.Error(w, "runtime_id required", http.StatusBadRequest)
		return
	}

	rc := h.NativeIDERelays.get(wsID)
	if rc == nil {
		http.Error(w, "IDE relay not connected", http.StatusServiceUnavailable)
		return
	}

	runtimeID := req.RuntimeID
	// No agent config needed — runtime is used directly for inline IDE chat.
	const instructions = "You are an expert code assistant integrated into a developer's IDE. Help with writing, reviewing, and debugging code. Be concise and precise."
	var customEnv map[string]string
	var customArgs []string
	var mcpConfig json.RawMessage
	model := ""

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	chatID := randomID()

	rc.ideChatMu.Lock()
	ch := make(chan nativeIDEChatEvent, 64)
	rc.ideChats[chatID] = ch
	rc.ideChatMu.Unlock()
	defer func() {
		rc.ideChatMu.Lock()
		delete(rc.ideChats, chatID)
		rc.ideChatMu.Unlock()
	}()

	msgs := make([]map[string]any, len(req.Messages))
	for i, m := range req.Messages {
		msgs[i] = map[string]any{"role": m.Role, "content": m.Content}
	}
	if err := rc.writeJSON(map[string]any{
		"type":         "ide_chat",
		"id":           chatID,
		"runtime_id":   runtimeID,
		"instructions": instructions,
		"custom_env":   customEnv,
		"custom_args":  customArgs,
		"mcp_config":   mcpConfig,
		"model":        model,
		"session_id":   req.SessionID,
		"messages":     msgs,
	}); err != nil {
		http.Error(w, "relay write error", http.StatusBadGateway)
		return
	}

	writeSSE := func(eventType string, data any) {
		b, _ := json.Marshal(data)
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
		_ = eventType
	}

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			switch ev.Type {
			case "ide_chat_delta":
				writeSSE("delta", map[string]any{"type": "delta", "text": ev.Text})
			case "ide_chat_tool_call":
				writeSSE("tool_call", map[string]any{"type": "tool_call", "tool": ev.Tool, "input": ev.Input})
			case "ide_chat_tool_result":
				writeSSE("tool_result", map[string]any{"type": "tool_result", "tool": ev.Tool, "content": ev.Content})
			case "ide_chat_done":
				writeSSE("done", map[string]any{"type": "done", "session_id": ev.Message})
				return
			case "ide_chat_error":
				writeSSE("error", map[string]any{"type": "error", "message": ev.Message})
				return
			}
		case <-time.After(10 * time.Minute):
			return
		}
	}
}
