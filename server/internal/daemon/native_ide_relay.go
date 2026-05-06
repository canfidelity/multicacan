//go:build !windows

package daemon

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/canfidelity/multicacan/server/pkg/agent"
	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// nativeIDELoop maintains a relay WebSocket per workspace for the native IDE.
// Each workspace gets one persistent relay connection that handles file system
// operations and PTY sessions.
func (d *Daemon) nativeIDELoop(ctx context.Context) {
	type runner struct {
		cancel context.CancelFunc
		done   chan struct{}
	}
	active := make(map[string]*runner)

	cleanup := func() {
		for _, r := range active {
			r.cancel()
			<-r.done
		}
	}
	defer cleanup()

	sync := func() {
		wsIDs := d.allWorkspaceIDs()
		want := make(map[string]bool, len(wsIDs))
		for _, id := range wsIDs {
			want[id] = true
		}
		// Stop runners for removed workspaces.
		for id, r := range active {
			if !want[id] {
				r.cancel()
				<-r.done
				delete(active, id)
			}
		}
		// Start runners for new workspaces.
		for _, wsID := range wsIDs {
			if _, exists := active[wsID]; !exists {
				rCtx, cancel := context.WithCancel(ctx)
				done := make(chan struct{})
				id := wsID
				go func() {
					defer close(done)
					d.runNativeIDERelay(rCtx, id)
				}()
				active[wsID] = &runner{cancel: cancel, done: done}
			}
		}
	}

	sync()
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sync()
		}
	}
}

// runNativeIDERelay reconnects with exponential backoff when the relay drops.
func (d *Daemon) runNativeIDERelay(ctx context.Context, workspaceID string) {
	backoff := 2 * time.Second
	for {
		if err := d.serveNativeIDERelay(ctx, workspaceID); err != nil {
			d.logger.Debug("native ide relay: disconnected", "workspace_id", workspaceID, "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

// serveNativeIDERelay opens one relay WebSocket and handles file + PTY messages.
func (d *Daemon) serveNativeIDERelay(ctx context.Context, workspaceID string) error {
	wsURL, err := nativeIDERelayURL(d.cfg.ServerBaseURL, workspaceID)
	if err != nil {
		return err
	}
	headers := http.Header{}
	if token := d.client.Token(); token != "" {
		headers.Set("Authorization", "Bearer "+token)
	}

	dialer := *websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second
	conn, resp, err := dialer.DialContext(ctx, wsURL, headers)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("dial (%d): %w", resp.StatusCode, err)
		}
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	d.logger.Info("native ide relay: connected", "workspace_id", workspaceID)

	var writeMu sync.Mutex
	writeMsg := func(v any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(v)
	}

	conn.SetPingHandler(func(data string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(websocket.PongMessage, []byte(data))
	})

	workspaceRoot := filepath.Join(d.cfg.WorkspacesRoot, workspaceID)

	// ptyMap holds active PTY sessions keyed by ptyID.
	type ptySession struct {
		f        *os.File
		cancel   context.CancelFunc
		mu       sync.Mutex
		attached bool // whether to forward output to relay
	}
	var ptyMu sync.Mutex
	ptyMap := make(map[string]*ptySession)

	closePTY := func(id string) {
		ptyMu.Lock()
		sess, ok := ptyMap[id]
		delete(ptyMap, id)
		ptyMu.Unlock()
		if ok {
			sess.cancel()
			sess.f.Close()
		}
	}
	defer func() {
		ptyMu.Lock()
		ids := make([]string, 0, len(ptyMap))
		for id := range ptyMap {
			ids = append(ids, id)
		}
		ptyMu.Unlock()
		for _, id := range ids {
			closePTY(id)
		}
	}()

	type msg struct {
		Type             string                   `json:"type"`
		ID               string                   `json:"id"`
		Path             string                   `json:"path,omitempty"`
		From             string                   `json:"from,omitempty"`
		To               string                   `json:"to,omitempty"`
		Content          string                   `json:"content,omitempty"` // base64
		Data             string                   `json:"data,omitempty"`    // base64 pty stdin
		Cols             int                      `json:"cols,omitempty"`
		Rows             int                      `json:"rows,omitempty"`
		RuntimeID    string                   `json:"runtime_id,omitempty"`
		Instructions string                   `json:"instructions,omitempty"`
		CustomEnv    map[string]string        `json:"custom_env,omitempty"`
		CustomArgs   []string                 `json:"custom_args,omitempty"`
		McpConfig    json.RawMessage          `json:"mcp_config,omitempty"`
		Model        string                   `json:"model,omitempty"`
		SessionID    string                   `json:"session_id,omitempty"`
		Messages     []map[string]interface{} `json:"messages,omitempty"`
	}

	sendFS := func(id string, entries []map[string]any, content, errMsg string) {
		m := map[string]any{"type": "fs_res", "id": id}
		if errMsg != "" {
			m["error"] = errMsg
		}
		if entries != nil {
			m["entries"] = entries
		}
		if content != "" {
			m["content"] = content
		}
		_ = writeMsg(m)
	}

	safePath := func(rel string) (string, error) {
		abs := filepath.Join(workspaceRoot, filepath.Clean("/"+rel))
		if !strings.HasPrefix(abs, workspaceRoot) {
			return "", fmt.Errorf("path outside workspace")
		}
		return abs, nil
	}

	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var m msg
		if err := json.Unmarshal(raw, &m); err != nil || m.ID == "" {
			continue
		}

		switch m.Type {

		case "fs_list":
			go func(m msg) {
				abs, err := safePath(m.Path)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				entries, err := os.ReadDir(abs)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				out := make([]map[string]any, 0, len(entries))
				for _, e := range entries {
					info, _ := e.Info()
					size := int64(0)
					if info != nil {
						size = info.Size()
					}
					out = append(out, map[string]any{
						"name": e.Name(),
						"dir":  e.IsDir(),
						"size": size,
					})
				}
				sendFS(m.ID, out, "", "")
			}(m)

		case "fs_read":
			go func(m msg) {
				abs, err := safePath(m.Path)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				data, err := os.ReadFile(abs)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				sendFS(m.ID, nil, base64.StdEncoding.EncodeToString(data), "")
			}(m)

		case "fs_write":
			go func(m msg) {
				abs, err := safePath(m.Path)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				data, err := base64.StdEncoding.DecodeString(m.Content)
				if err != nil {
					sendFS(m.ID, nil, "", "invalid base64")
					return
				}
				if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				if err := os.WriteFile(abs, data, 0644); err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				sendFS(m.ID, nil, "", "")
			}(m)

		case "fs_delete":
			go func(m msg) {
				abs, err := safePath(m.Path)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				if err := os.Remove(abs); err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				sendFS(m.ID, nil, "", "")
			}(m)

		case "fs_rename":
			go func(m msg) {
				absFrom, err := safePath(m.From)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				absTo, err := safePath(m.To)
				if err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				if err := os.Rename(absFrom, absTo); err != nil {
					sendFS(m.ID, nil, "", err.Error())
					return
				}
				sendFS(m.ID, nil, "", "")
			}(m)

		case "pty_open":
			go func(m msg) {
				cols, rows := m.Cols, m.Rows
				if cols <= 0 {
					cols = 80
				}
				if rows <= 0 {
					rows = 24
				}

				shell := "bash"
				if _, err := exec.LookPath("zsh"); err == nil {
					shell = "zsh"
				}

				pCtx, cancel := context.WithCancel(ctx)
				cmd := exec.CommandContext(pCtx, shell)
				cmd.Env = append(os.Environ(),
					"TERM=xterm-256color",
					fmt.Sprintf("HOME=%s", workspaceRoot),
					fmt.Sprintf("MULTICA_WORKSPACE_ID=%s", workspaceID),
				)
				cmd.Dir = workspaceRoot

				ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
					Cols: uint16(cols),
					Rows: uint16(rows),
				})
				if err != nil {
					cancel()
					_ = writeMsg(map[string]any{"type": "pty_closed", "id": m.ID})
					return
				}

				sess := &ptySession{f: ptmx, cancel: cancel, attached: true}
				ptyMu.Lock()
				ptyMap[m.ID] = sess
				ptyMu.Unlock()

				id := m.ID

				// Stdout pump: PTY → relay (only when attached).
				go func() {
					buf := make([]byte, 4096)
					for {
						n, err := ptmx.Read(buf)
						if n > 0 {
							encoded := base64.StdEncoding.EncodeToString(buf[:n])
							sess.mu.Lock()
							att := sess.attached
							sess.mu.Unlock()
							if att {
								_ = writeMsg(map[string]any{
									"type": "pty_output",
									"id":   id,
									"data": encoded,
								})
							}
						}
						if err != nil {
							break
						}
					}
					sess.mu.Lock()
					att := sess.attached
					sess.mu.Unlock()
					closePTY(id)
					if att {
						_ = writeMsg(map[string]any{"type": "pty_closed", "id": id})
					}
				}()
			}(m)

		case "pty_input":
			data, err := base64.StdEncoding.DecodeString(m.Data)
			if err != nil {
				continue
			}
			ptyMu.Lock()
			sess := ptyMap[m.ID]
			ptyMu.Unlock()
			if sess != nil {
				_, _ = sess.f.Write(data)
			}

		case "pty_resize":
			ptyMu.Lock()
			sess := ptyMap[m.ID]
			ptyMu.Unlock()
			if sess != nil && m.Cols > 0 && m.Rows > 0 {
				_ = pty.Setsize(sess.f, &pty.Winsize{
					Cols: uint16(m.Cols),
					Rows: uint16(m.Rows),
				})
			}

		case "pty_close":
			closePTY(m.ID)

		case "pty_detach":
			ptyMu.Lock()
			sess := ptyMap[m.ID]
			ptyMu.Unlock()
			if sess != nil {
				sess.mu.Lock()
				sess.attached = false
				sess.mu.Unlock()
			}

		case "pty_reattach":
			ptyMu.Lock()
			sess := ptyMap[m.ID]
			ptyMu.Unlock()
			if sess == nil {
				// PTY no longer exists (daemon restarted) — tell VPS so browser can open a new one.
				_ = writeMsg(map[string]any{"type": "pty_closed", "id": m.ID})
			} else {
				sess.mu.Lock()
				sess.attached = true
				sess.mu.Unlock()
			}

		case "ide_chat":
			chatMsg := m
			go d.serveNativeIDEChat(ctx, workspaceID, workspaceRoot, writeMsg, chatMsg.ID, chatMsg.RuntimeID, chatMsg.Instructions, chatMsg.CustomEnv, chatMsg.CustomArgs, chatMsg.McpConfig, chatMsg.Model, chatMsg.SessionID, chatMsg.Messages)
		}
	}
}

// ── IDE Streaming Chat ────────────────────────────────────────────────────

func (d *Daemon) serveNativeIDEChat(
	ctx context.Context,
	workspaceID, workspaceRoot string,
	writeMsg func(any) error,
	chatID, runtimeID, instructions string,
	customEnv map[string]string,
	customArgs []string,
	mcpConfig json.RawMessage,
	model, sessionID string,
	messages []map[string]interface{},
) {
	send := func(payload map[string]any) {
		payload["id"] = chatID
		_ = writeMsg(payload)
	}

	rt := d.findRuntime(runtimeID)
	if rt == nil {
		send(map[string]any{"type": "ide_chat_error", "message": "runtime not connected: " + runtimeID})
		return
	}

	entry, ok := d.cfg.Agents[rt.Provider]
	if !ok {
		send(map[string]any{"type": "ide_chat_error", "message": "agent provider not configured on this daemon: " + rt.Provider})
		return
	}

	// IDE chat runs the CLI without Multica task credentials so the agent
	// doesn't register tasks or report to the server — it just does inline chat.
	agentEnv := map[string]string{}
	if selfBin, err := os.Executable(); err == nil {
		binDir := filepath.Dir(selfBin)
		agentEnv["PATH"] = binDir + string(os.PathListSeparator) + os.Getenv("PATH")
	}
	for k, v := range customEnv {
		if !isBlockedEnvKey(k) {
			agentEnv[k] = v
		}
	}

	backend, err := agent.New(rt.Provider, agent.Config{
		ExecutablePath: entry.Path,
		Env:            agentEnv,
		Logger:         d.logger,
	})
	if err != nil {
		send(map[string]any{"type": "ide_chat_error", "message": "failed to create agent backend: " + err.Error()})
		return
	}

	// Build prompt: resume with last user message when session_id provided,
	// otherwise format the full conversation history.
	var prompt string
	if sessionID != "" {
		for i := len(messages) - 1; i >= 0; i-- {
			if role, _ := messages[i]["role"].(string); role == "user" {
				if content, _ := messages[i]["content"].(string); content != "" {
					prompt = content
					break
				}
			}
		}
	}
	if prompt == "" {
		prompt = buildIDEChatPrompt(messages)
	}

	effectiveModel := model
	if effectiveModel == "" {
		effectiveModel = entry.Model
	}

	opts := agent.ExecOptions{
		Cwd:             workspaceRoot,
		Model:           effectiveModel,
		SystemPrompt:    instructions,
		ResumeSessionID: sessionID,
		CustomArgs:      customArgs,
		McpConfig:       mcpConfig,
		MaxTurns:        50,
	}

	session, err := backend.Execute(ctx, prompt, opts)
	if err != nil {
		send(map[string]any{"type": "ide_chat_error", "message": "execute error: " + err.Error()})
		return
	}

	var newSessionID string
	for msg := range session.Messages {
		switch msg.Type {
		case agent.MessageText:
			if msg.Content != "" {
				send(map[string]any{"type": "ide_chat_delta", "text": msg.Content})
			}
		case agent.MessageToolUse:
			inputRaw, _ := json.Marshal(msg.Input)
			send(map[string]any{"type": "ide_chat_tool_call", "tool": msg.Tool, "input": json.RawMessage(inputRaw)})
		case agent.MessageToolResult:
			send(map[string]any{"type": "ide_chat_tool_result", "tool": msg.Tool, "content": msg.Output})
		case agent.MessageStatus:
			if msg.SessionID != "" {
				newSessionID = msg.SessionID
			}
		}
	}

	result := <-session.Result
	if result.SessionID != "" {
		newSessionID = result.SessionID
	}

	send(map[string]any{"type": "ide_chat_done", "session_id": newSessionID})
}

func buildIDEChatPrompt(messages []map[string]interface{}) string {
	if len(messages) == 0 {
		return ""
	}
	// Single message: return content directly
	if len(messages) == 1 {
		if content, _ := messages[0]["content"].(string); content != "" {
			return content
		}
	}
	// Multi-turn: format as conversation
	var sb strings.Builder
	for i, m := range messages {
		role, _ := m["role"].(string)
		content, _ := m["content"].(string)
		if content == "" {
			continue
		}
		if i > 0 {
			sb.WriteString("\n\n")
		}
		if role == "user" {
			sb.WriteString("Human: ")
		} else {
			sb.WriteString("Assistant: ")
		}
		sb.WriteString(content)
	}
	return sb.String()
}

func nativeIDERelayURL(baseURL, workspaceID string) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	default:
		u.Scheme = "ws"
	}
	u.Path = "/api/native-ide/relay"
	q := url.Values{}
	q.Set("workspace_id", workspaceID)
	u.RawQuery = q.Encode()
	return u.String(), nil
}
