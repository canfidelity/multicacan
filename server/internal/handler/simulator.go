package handler

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// serveSimState mirrors the JSON written by serve-sim to /tmp/serve-sim/server-*.json.
type serveSimState struct {
	PID       int    `json:"pid"`
	Port      int    `json:"port"`
	Device    string `json:"device"`
	URL       string `json:"url"`
	StreamURL string `json:"streamUrl"`
	WSURL     string `json:"wsUrl"`
}

// readServeSimState reads the first active serve-sim state file.
// Returns nil if no running serve-sim instance is found.
// serveSimStateDirs returns candidate directories where serve-sim writes state files.
// On macOS, os.TempDir() returns /tmp but Node's os.tmpdir() returns /var/folders/…/T,
// so we check both.
func serveSimStateDirs() []string {
	dirs := []string{filepath.Join(os.TempDir(), "serve-sim")}
	if envTmp := os.Getenv("TMPDIR"); envTmp != "" && envTmp != os.TempDir() {
		dirs = append(dirs, filepath.Join(envTmp, "serve-sim"))
	}
	// macOS: Node.js uses the user-specific TMPDIR from /var/folders.
	matches, _ := filepath.Glob("/var/folders/*/*/T/serve-sim")
	dirs = append(dirs, matches...)
	return dirs
}

func readServeSimState() *serveSimState {
	for _, stateDir := range serveSimStateDirs() {
		if s := readServeSimStateFromDir(stateDir); s != nil {
			return s
		}
	}
	return nil
}

func readServeSimStateFromDir(stateDir string) *serveSimState {
	entries, err := os.ReadDir(stateDir)
	if err != nil {
		return nil
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "server-") || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(stateDir, e.Name()))
		if err != nil {
			continue
		}
		var state serveSimState
		if err := json.Unmarshal(data, &state); err != nil {
			continue
		}
		// Check if the process is still alive.
		proc, err := os.FindProcess(state.PID)
		if err != nil {
			continue
		}
		if err := proc.Signal(syscall.Signal(0)); err != nil {
			// Process is dead — clean up stale state file.
			os.Remove(filepath.Join(stateDir, e.Name()))
			continue
		}
		return &state
	}
	return nil
}

// SimulatorStatus returns the booted simulator info or null.
func (h *Handler) SimulatorStatus(w http.ResponseWriter, r *http.Request) {
	// If a relay daemon is connected for this workspace, report available via relay.
	// Check relay: workspace_id from context (workspace routes) or query param.
	wsID := ctxWorkspaceID(r.Context())
	if wsID == "" {
		wsID = r.URL.Query().Get("workspace_id")
	}
	if wsID != "" {
		if rc := h.SimulatorRelays.Get(wsID); rc != nil {
			// Query the real booted device from the Mac Mini via exec relay.
			res, err := rc.sendExec("xcrun simctl list devices booted -j", 5*time.Second)
			if err == nil && res.ExitCode == 0 {
				var simData struct {
					Devices map[string][]struct {
						UDID  string `json:"udid"`
						Name  string `json:"name"`
						State string `json:"state"`
					} `json:"devices"`
				}
				if json.Unmarshal([]byte(res.Stdout), &simData) == nil {
					for _, devs := range simData.Devices {
						for _, d := range devs {
							if d.State == "Booted" {
								writeJSON(w, http.StatusOK, map[string]any{
									"device": d.UDID,
									"name":   d.Name,
									"native": true,
									"relay":  true,
								})
								return
							}
						}
					}
				}
			}
			// Relay connected but couldn't get device info — still show as available.
			writeJSON(w, http.StatusOK, map[string]any{
				"device": "relay",
				"name":   "Remote Simulator",
				"native": true,
				"relay":  true,
			})
			return
		}
	}
	// Check if sim-capture binary exists
	if findSimHelper("sim-capture") == "" {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	// Check for booted simulator via simctl
	out, err := exec.Command("xcrun", "simctl", "list", "devices", "booted", "-j").Output()
	if err != nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	var data struct {
		Devices map[string][]struct {
			UDID  string `json:"udid"`
			Name  string `json:"name"`
			State string `json:"state"`
		} `json:"devices"`
	}
	if err := json.Unmarshal(out, &data); err != nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	// Find first booted device
	for _, devs := range data.Devices {
		for _, d := range devs {
			if d.State == "Booted" {
				writeJSON(w, http.StatusOK, map[string]any{
					"device":  d.UDID,
					"name":    d.Name,
					"native":  true,
				})
				return
			}
		}
	}
	writeJSON(w, http.StatusOK, nil)
}

// SimulatorConfigProxy proxies GET /config from serve-sim.
func (h *Handler) SimulatorConfigProxy(w http.ResponseWriter, r *http.Request) {
	state := readServeSimState()
	if state == nil {
		writeError(w, http.StatusServiceUnavailable, "no simulator running")
		return
	}
	proxyGet(w, r, fmt.Sprintf("http://127.0.0.1:%d/config", state.Port))
}

// SimulatorStreamProxy proxies the MJPEG stream from serve-sim.
func (h *Handler) SimulatorStreamProxy(w http.ResponseWriter, r *http.Request) {
	state := readServeSimState()
	if state == nil {
		writeError(w, http.StatusServiceUnavailable, "no simulator running")
		return
	}

	target := fmt.Sprintf("http://127.0.0.1:%d/stream.mjpeg", state.Port)
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", target, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request")
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to connect to simulator stream")
		return
	}
	defer resp.Body.Close()

	// Copy headers from serve-sim response.
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	// Stream the MJPEG data with flushing so frames arrive immediately.
	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				break // client disconnected
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break // upstream closed
		}
	}
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ─── Simulator Relay Hub ───
//
// The relay hub lets a Mac Mini daemon tunnel its local iOS simulator stream
// through this VPS so a browser running anywhere can drive it. The daemon
// opens an outbound WebSocket to /api/simulator/relay (registered here),
// and the browser's existing /api/simulator/native handler bridges to that
// connection on a per-workspace basis when one is registered.
//
// Wire format on the relay socket (between VPS and daemon):
//   - Control frames are TextMessage JSON: {"type":"start"|"stop"|"touch"|...}
//   - Frame data from daemon → VPS uses BinaryMessage: raw JPEG bytes
//     (length is implicit in the WebSocket frame, no 4-byte prefix needed)
//
// Wire format on the browser socket is unchanged: BinaryMessage carries
// the same JPEG bytes; input events use the existing tagged format.

// SimulatorRelayHub stores active daemon relay connections keyed by workspace.
type SimulatorRelayHub struct {
	mu    sync.Mutex
	conns map[string]*relayConn // workspaceID -> conn
}

// relayConn wraps a single daemon's relay WebSocket plus a write mutex so
// that the bridging goroutines (control writes from the browser-side
// handler) don't interleave bytes on the wire. Only the registration
// goroutine reads from `ws`; it dispatches incoming frames/messages to the
// currently-attached browser bridge (if any) via subscribe/unsubscribe.
type relayConn struct {
	ws      *websocket.Conn
	writeMu sync.Mutex

	subMu      sync.Mutex
	subscriber *relaySubscriber // nil when no browser is bridged

	execMu      sync.Mutex
	pendingExec map[string]chan execRelayResult // req_id -> result chan
}

type execRelayResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

// sendExec sends an exec request to the daemon and waits for the result.
func (rc *relayConn) sendExec(command string, timeout time.Duration) (execRelayResult, error) {
	reqID := fmt.Sprintf("%d", time.Now().UnixNano())
	ch := make(chan execRelayResult, 1)
	rc.execMu.Lock()
	if rc.pendingExec == nil {
		rc.pendingExec = make(map[string]chan execRelayResult)
	}
	rc.pendingExec[reqID] = ch
	rc.execMu.Unlock()
	defer func() {
		rc.execMu.Lock()
		delete(rc.pendingExec, reqID)
		rc.execMu.Unlock()
	}()
	if err := rc.writeJSON(map[string]any{"type": "exec_req", "req_id": reqID, "command": command}); err != nil {
		return execRelayResult{}, err
	}
	select {
	case res := <-ch:
		return res, nil
	case <-time.After(timeout):
		return execRelayResult{}, fmt.Errorf("exec relay timeout")
	}
}

// relaySubscriber receives messages forwarded by the relay read pump.
// `binary` carries JPEG frames; `text` carries any text messages the
// daemon sends back (currently unused but reserved for diagnostics).
type relaySubscriber struct {
	binary chan []byte
	text   chan []byte
	closed chan struct{} // closed by the relay read pump on daemon disconnect
}

// attach installs s as the active subscriber for incoming relay messages.
// Any previous subscriber is detached (its `closed` channel is fired).
func (rc *relayConn) attach(s *relaySubscriber) {
	rc.subMu.Lock()
	defer rc.subMu.Unlock()
	if rc.subscriber != nil {
		safeClose(rc.subscriber.closed)
	}
	rc.subscriber = s
}

// detach removes s as the subscriber if it is still the active one.
func (rc *relayConn) detach(s *relaySubscriber) {
	rc.subMu.Lock()
	defer rc.subMu.Unlock()
	if rc.subscriber == s {
		rc.subscriber = nil
	}
}

// dispatch forwards a binary or text message to the active subscriber.
// Drops the message if no subscriber is attached, or if the subscriber's
// queue is full (slow browser shouldn't backpressure the daemon).
func (rc *relayConn) dispatch(msgType int, data []byte) {
	// Handle exec_res text messages before forwarding to subscriber.
	if msgType == websocket.TextMessage {
		var msg struct {
			Type     string `json:"type"`
			ReqID    string `json:"req_id"`
			Stdout   string `json:"stdout"`
			Stderr   string `json:"stderr"`
			ExitCode int    `json:"exit_code"`
		}
		if json.Unmarshal(data, &msg) == nil && msg.Type == "exec_res" && msg.ReqID != "" {
			rc.execMu.Lock()
			ch := rc.pendingExec[msg.ReqID]
			rc.execMu.Unlock()
			if ch != nil {
				select {
				case ch <- execRelayResult{Stdout: msg.Stdout, Stderr: msg.Stderr, ExitCode: msg.ExitCode}:
				default:
				}
			}
			return
		}
	}

	rc.subMu.Lock()
	sub := rc.subscriber
	rc.subMu.Unlock()
	if sub == nil {
		return
	}
	switch msgType {
	case websocket.BinaryMessage:
		select {
		case sub.binary <- data:
		default:
			// Browser can't keep up; dropping the frame is the
			// correct behavior for live video — the next one is
			// only ~16ms away.
		}
	case websocket.TextMessage:
		select {
		case sub.text <- data:
		default:
		}
	}
}

func safeClose(ch chan struct{}) {
	defer func() { recover() }()
	close(ch)
}

// NewSimulatorRelayHub returns an empty hub.
func NewSimulatorRelayHub() *SimulatorRelayHub {
	return &SimulatorRelayHub{conns: make(map[string]*relayConn)}
}

// Register stores the relay connection for the workspace, replacing any
// previous one (the previous daemon is closed so it reconnects cleanly).
func (h *SimulatorRelayHub) Register(workspaceID string, ws *websocket.Conn) *relayConn {
	rc := &relayConn{ws: ws}
	h.mu.Lock()
	if prev, ok := h.conns[workspaceID]; ok {
		// Best-effort close of the previous registration — the displaced
		// daemon's read loop will exit and trigger a reconnect.
		prev.writeMu.Lock()
		prev.ws.Close()
		prev.writeMu.Unlock()
	}
	h.conns[workspaceID] = rc
	h.mu.Unlock()
	return rc
}

// Get returns the relay conn for a workspace, or nil if none registered.
func (h *SimulatorRelayHub) Get(workspaceID string) *relayConn {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.conns[workspaceID]
}

// Unregister removes a relay registration if (and only if) the stored
// pointer matches `rc`. This avoids racing with a fresh Register that
// already replaced us.
func (h *SimulatorRelayHub) Unregister(workspaceID string, rc *relayConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[workspaceID] == rc {
		delete(h.conns, workspaceID)
	}
}

// writeJSON serializes a JSON control message to the relay daemon.
func (rc *relayConn) writeJSON(v any) error {
	rc.writeMu.Lock()
	defer rc.writeMu.Unlock()
	return rc.ws.WriteJSON(v)
}

// writeText forwards an already-serialized JSON line as a TextMessage.
func (rc *relayConn) writeText(b []byte) error {
	rc.writeMu.Lock()
	defer rc.writeMu.Unlock()
	return rc.ws.WriteMessage(websocket.TextMessage, b)
}

// SimulatorRelayRegister upgrades the request to a WebSocket and registers
// the daemon as the relay for its workspace. Authentication is handled by
// the DaemonAuth middleware on the parent route group; the workspace ID
// must be supplied via the `workspace_id` query parameter.
func (h *Handler) SimulatorRelayRegister(w http.ResponseWriter, r *http.Request) {
	if h.SimulatorRelays == nil {
		writeError(w, http.StatusServiceUnavailable, "simulator relay disabled")
		return
	}
	workspaceID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id query parameter is required")
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("simulator relay: upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	rc := h.SimulatorRelays.Register(workspaceID, conn)
	defer h.SimulatorRelays.Unregister(workspaceID, rc)

	slog.Info("simulator relay: daemon registered", "workspace_id", workspaceID)

	// Read pump: forward every message to the active subscriber (set by
	// SimulatorNativeWS while a browser is connected). When no subscriber
	// is attached, messages are dropped — daemons should only stream after
	// receiving a "start" control message, but draining keeps the socket
	// healthy regardless.
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			slog.Info("simulator relay: daemon disconnected",
				"workspace_id", workspaceID, "error", err)
			// Notify any attached subscriber that the upstream is gone.
			rc.subMu.Lock()
			if rc.subscriber != nil {
				safeClose(rc.subscriber.closed)
				rc.subscriber = nil
			}
			rc.subMu.Unlock()
			return
		}
		rc.dispatch(msgType, data)
	}
}

// bridgeBrowserToRelay shuttles a browser WebSocket between an active relay
// connection: frames daemon→browser, input/control browser→daemon. Returns
// when either side disconnects. The caller is responsible for closing the
// browser conn.
func bridgeBrowserToRelay(browser *websocket.Conn, rc *relayConn, udid string) {
	sub := &relaySubscriber{
		binary: make(chan []byte, 8),
		text:   make(chan []byte, 4),
		closed: make(chan struct{}),
	}
	rc.attach(sub)
	// Tek bir defer: detach + "stop" atomik olarak yapılır.
	// "stop" sadece hâlâ aktif subscriber isek gönderilir.
	// Yeni bir tarayıcı bizi yerinden ederse (attach → safeClose), "stop"
	// göndermiyoruz — aksi halde yeni bağlantının "start"ından sonra daemon'a
	// ulaşıp sim-capture'ı öldürürdü (yarış koşulu).
	defer func() {
		rc.subMu.Lock()
		wasActive := rc.subscriber == sub
		if wasActive {
			rc.subscriber = nil
		}
		rc.subMu.Unlock()
		if wasActive {
			_ = rc.writeJSON(map[string]any{"type": "stop"})
		}
	}()

	// Tell the daemon to begin streaming.
	if err := rc.writeJSON(map[string]any{"type": "start", "udid": udid}); err != nil {
		slog.Warn("simulator relay: send start failed", "error", err)
		return
	}

	done := make(chan struct{})

	// Browser → relay: forward input events.
	go func() {
		defer close(done)
		for {
			msgType, msg, err := browser.ReadMessage()
			if err != nil {
				return
			}
			if msgType != websocket.TextMessage && msgType != websocket.BinaryMessage {
				continue
			}
			// Browser sends tagged input frames (1-byte tag + JSON payload).
			// Translate to plain JSON control messages for the relay so the
			// daemon doesn't have to know about the browser tag scheme.
			if msgType == websocket.BinaryMessage && len(msg) >= 2 {
				tag := msg[0]
				payload := msg[1:]
				var evt map[string]any
				if err := json.Unmarshal(payload, &evt); err != nil {
					continue
				}
				switch tag {
				case 0x03:
					// Frontend sends {type:"begin"|"move"|"end", x, y}
					// sim-input expects {type:"touch", phase:"down"|"move"|"up", x, y}
					phase, _ := evt["type"].(string)
					switch phase {
					case "begin":
						phase = "down"
					case "move":
						phase = "move"
					case "end":
						phase = "up"
					}
					evt["type"] = "touch"
					evt["phase"] = phase
				case 0x04:
					evt["type"] = "button"
				case 0x06:
					// Browser sends {type:"down"|"up", usage:N}
					// sim-input expects {type:"key", phase:"down"|"up", usage:N}
					keyPhase, _ := evt["type"].(string)
					evt["type"] = "key"
					evt["phase"] = keyPhase
				default:
					continue
				}
				line, _ := json.Marshal(evt)
				if err := rc.writeText(line); err != nil {
					return
				}
			} else {
				// Pass-through: text messages forwarded as-is.
				if err := rc.writeText(msg); err != nil {
					return
				}
			}
		}
	}()

	// Relay → browser: forward JPEG frames.
	for {
		select {
		case frame, ok := <-sub.binary:
			if !ok {
				return
			}
			if err := browser.WriteMessage(websocket.BinaryMessage, frame); err != nil {
				return
			}
		case <-sub.text:
			// Currently no text frames are forwarded to the browser.
		case <-sub.closed:
			return
		case <-done:
			return
		}
	}
}

// SimulatorWSProxy proxies the WebSocket connection to serve-sim.
func (h *Handler) SimulatorWSProxy(w http.ResponseWriter, r *http.Request) {
	state := readServeSimState()
	if state == nil {
		writeError(w, http.StatusServiceUnavailable, "no simulator running")
		return
	}

	// Upgrade client connection.
	clientConn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("simulator ws: client upgrade failed", "error", err)
		return
	}
	defer clientConn.Close()

	// Connect to serve-sim WebSocket.
	targetURL := fmt.Sprintf("ws://127.0.0.1:%d/ws", state.Port)
	simConn, _, err := websocket.DefaultDialer.Dial(targetURL, nil)
	if err != nil {
		slog.Error("simulator ws: dial serve-sim failed", "error", err)
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "simulator not reachable"))
		return
	}
	defer simConn.Close()

	done := make(chan struct{})

	// Client → Simulator
	go func() {
		defer close(done)
		for {
			msgType, msg, err := clientConn.ReadMessage()
			if err != nil {
				return
			}
			if err := simConn.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	// Simulator → Client
	for {
		msgType, msg, err := simConn.ReadMessage()
		if err != nil {
			break
		}
		if err := clientConn.WriteMessage(msgType, msg); err != nil {
			break
		}
	}

	<-done
}

// execAllowedPrefixes defines the commands that can be run through the exec proxy.
// For compound commands (pipelines, semicolons) each segment is checked.
var execAllowedPrefixes = []string{
	"xcrun simctl ",
	"serve-sim ",
	"bunx serve-sim ",
	"kill ",
	"nohup ",
	"sleep ",
	"cat ",
	"grep ",
}

// SimulatorExecProxy runs an allowlisted shell command on the host.
func (h *Handler) SimulatorExecProxy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Command == "" {
		writeError(w, http.StatusBadRequest, "missing command")
		return
	}

	// Allowlist check — split on ; and check each segment.
	segments := strings.Split(req.Command, ";")
	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		segAllowed := false
		for _, prefix := range execAllowedPrefixes {
			if strings.HasPrefix(seg, prefix) {
				segAllowed = true
				break
			}
		}
		if !segAllowed {
			slog.Warn("simulator exec: blocked command segment", "segment", seg, "full", req.Command)
			writeError(w, http.StatusForbidden, "command not allowed — only xcrun simctl and serve-sim commands are permitted")
			return
		}
	}

	slog.Info("simulator exec", "command", req.Command)

	// If a relay daemon is connected for this workspace, forward the exec to the Mac Mini.
	// This lets xcrun simctl (and other commands) run on the real Mac instead of the VPS.
	if h.SimulatorRelays != nil {
		wsID := r.URL.Query().Get("workspace_id")
		if wsID == "" {
			wsID = ctxWorkspaceID(r.Context())
		}
		if wsID != "" {
			if rc := h.SimulatorRelays.Get(wsID); rc != nil {
				res, err := rc.sendExec(req.Command, 15*time.Second)
				if err == nil {
					writeJSON(w, http.StatusOK, map[string]any{
						"stdout":   res.Stdout,
						"stderr":   res.Stderr,
						"exitCode": res.ExitCode,
					})
					return
				}
				slog.Warn("exec relay failed, falling back to local exec", "error", err)
			}
		}
	}

	// serve-sim kill: handle natively by sending SIGTERM to PID from state file.
	if strings.Contains(req.Command, "serve-sim --kill") {
		if s := readServeSimState(); s != nil {
			if p, err := os.FindProcess(s.PID); err == nil {
				p.Signal(syscall.SIGTERM)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"stdout": "", "stderr": "", "exitCode": 0})
		return
	}

	// serve-sim detach: find the cached serve-sim-bin and spawn it directly.
	if strings.Contains(req.Command, "serve-sim --detach") {
		// Extract UDID from command
		parts := strings.Fields(req.Command)
		udid := ""
		for i, p := range parts {
			if p == "--detach" && i+1 < len(parts) {
				udid = parts[i+1]
			}
		}
		if udid == "" {
			// No UDID specified — find first booted
			out, err := exec.Command("xcrun", "simctl", "list", "devices", "booted", "-j").Output()
			if err == nil {
				var d struct{ Devices map[string][]struct{ UDID, State string } }
				json.Unmarshal(out, &d)
				for _, devs := range d.Devices {
					for _, dev := range devs {
						if dev.State == "Booted" { udid = dev.UDID; break }
					}
					if udid != "" { break }
				}
			}
		}
		if udid == "" {
			writeJSON(w, http.StatusOK, map[string]any{"stdout": "", "stderr": "no booted device", "exitCode": 1})
			return
		}
		// Find serve-sim-bin
		binPaths, _ := filepath.Glob("/var/folders/*/*/T/bunx-501-serve-sim*/node_modules/serve-sim/bin/serve-sim-bin")
		if len(binPaths) == 0 {
			// Fallback: try bunx but fully detached via launchctl
			exec.Command("sh", "-c", fmt.Sprintf("launchctl submit -l com.serve-sim.detach -- bunx serve-sim --detach %s", udid)).Run()
			writeJSON(w, http.StatusOK, map[string]any{"stdout": "", "stderr": "", "exitCode": 0})
			return
		}
		binPath := binPaths[0]
		port := 3100
		// Find free port if 3100 is taken
		for p := 3100; p < 3110; p++ {
			conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", p), 100*time.Millisecond)
			if err != nil {
				port = p
				break
			}
			conn.Close()
		}
		cmd := exec.Command(binPath, udid, "--port", fmt.Sprintf("%d", port))
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		devNull, _ := os.Open(os.DevNull)
		cmd.Stdin = devNull
		cmd.Stdout = devNull
		cmd.Stderr = devNull
		if err := cmd.Start(); err != nil {
			devNull.Close()
			writeJSON(w, http.StatusOK, map[string]any{"stdout": "", "stderr": err.Error(), "exitCode": 1})
			return
		}
		devNull.Close()
		go cmd.Wait() // reap zombie
		// Write state file
		stateDir := ""
		matches, _ := filepath.Glob("/var/folders/*/*/T/serve-sim")
		if len(matches) > 0 {
			stateDir = matches[0]
		} else {
			stateDir = filepath.Join(os.TempDir(), "serve-sim")
			os.MkdirAll(stateDir, 0o755)
		}
		stateJSON, _ := json.Marshal(map[string]any{
			"pid": cmd.Process.Pid, "port": port, "device": udid,
			"url": fmt.Sprintf("http://127.0.0.1:%d", port),
			"streamUrl": fmt.Sprintf("http://127.0.0.1:%d/stream.mjpeg", port),
			"wsUrl": fmt.Sprintf("ws://127.0.0.1:%d/ws", port),
		})
		os.WriteFile(filepath.Join(stateDir, fmt.Sprintf("server-%s.json", udid)), stateJSON, 0o644)
		slog.Info("serve-sim-bin spawned directly", "pid", cmd.Process.Pid, "port", port, "udid", udid)
		writeJSON(w, http.StatusOK, map[string]any{"stdout": "", "stderr": "", "exitCode": 0})
		return
	}

	// Regular commands run in their own process group.
	cmd := exec.Command("sh", "-c", req.Command)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	var stdoutBuf, stderrBuf strings.Builder
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"stdout":   stdoutBuf.String(),
		"stderr":   stderrBuf.String(),
		"exitCode": exitCode,
	})
}

// proxyGet is a helper that forwards a GET request and copies the response.
func proxyGet(w http.ResponseWriter, r *http.Request, target string) {
	req, err := http.NewRequestWithContext(r.Context(), "GET", target, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request")
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to connect to simulator")
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// ─── Native Capture WebSocket ───
//
// Spawns sim-capture (IOSurface ~60Hz) and sim-input (HID forwarder),
// streams JPEG frames to the browser via WebSocket, receives input events back.

// findSimHelper locates the compiled helper binary next to the Go server binary.
func findSimHelper(name string) string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	// Check next to the server binary first
	dir := filepath.Dir(exe)
	candidate := filepath.Join(dir, "sim-helpers", name)
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	// Check in the handler source directory (dev mode)
	candidates, _ := filepath.Glob(filepath.Join(dir, "..", "internal", "handler", "sim-helpers", name))
	if len(candidates) > 0 {
		return candidates[0]
	}
	// Check relative to cwd
	candidate = filepath.Join("internal", "handler", "sim-helpers", name)
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	return ""
}

// SimulatorNativeWS serves a single WebSocket that:
//   - Spawns sim-capture, reads [u32 len][JPEG] frames, sends as binary WS messages
//   - Spawns sim-input on first input event, pipes NDJSON to its stdin
//   - Receives JSON input events from the browser and forwards to sim-input
//
// When `workspace_id` is supplied as a query parameter and a Mac Mini daemon
// has registered a relay for that workspace via SimulatorRelayRegister, the
// connection is bridged to the daemon's relay instead of spawning the local
// helpers. This is what makes "browser anywhere → simulator on Mac Mini"
// work through the VPS.
func (h *Handler) SimulatorNativeWS(w http.ResponseWriter, r *http.Request) {
	udid := r.URL.Query().Get("device")

	// If the request targets a workspace and a relay daemon is registered,
	// bridge to it instead of falling back to local capture. Local capture
	// only makes sense when the API server is co-located with the simulator
	// (single-machine dev setup).
	if h.SimulatorRelays != nil {
		workspaceID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
		if workspaceID != "" {
			if rc := h.SimulatorRelays.Get(workspaceID); rc != nil {
				conn, err := wsUpgrader.Upgrade(w, r, nil)
				if err != nil {
					slog.Error("simulator native ws: upgrade failed", "error", err)
					return
				}
				defer conn.Close()
				slog.Info("simulator native ws: bridging to relay",
					"workspace_id", workspaceID, "udid", udid)
				bridgeBrowserToRelay(conn, rc, udid)
				return
			}
		}
	}

	captureBin := findSimHelper("sim-capture")
	if captureBin == "" {
		writeError(w, http.StatusServiceUnavailable, "sim-capture binary not found")
		return
	}
	inputBin := findSimHelper("sim-input")

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("native sim ws: upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	// Spawn sim-capture, optionally pinned to a specific UDID via query param
	captureArgs := []string{}
	if udid != "" {
		captureArgs = []string{"--udid", udid}
	}
	captureCmd := exec.Command(captureBin, captureArgs...)
	captureCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	captureStdout, err := captureCmd.StdoutPipe()
	if err != nil {
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "pipe failed"))
		return
	}
	captureCmd.Stderr = os.Stderr
	if err := captureCmd.Start(); err != nil {
		slog.Error("native sim ws: capture start failed", "error", err)
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "capture start failed"))
		return
	}
	defer func() {
		captureCmd.Process.Signal(syscall.SIGTERM)
		go captureCmd.Wait()
	}()

	slog.Info("native sim ws: capture started", "pid", captureCmd.Process.Pid, "udid", udid)

	// Lazy sim-input process
	var inputCmd *exec.Cmd
	var inputStdin io.WriteCloser
	var inputMu sync.Mutex

	ensureInput := func() {
		inputMu.Lock()
		defer inputMu.Unlock()
		if inputCmd != nil {
			return
		}
		if inputBin == "" {
			return
		}
		inputArgs := []string{}
		if udid != "" {
			inputArgs = []string{"--udid", udid}
		}
		inputCmd = exec.Command(inputBin, inputArgs...)
		inputCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		var err error
		inputStdin, err = inputCmd.StdinPipe()
		if err != nil {
			slog.Error("native sim ws: input pipe failed", "error", err)
			inputCmd = nil
			return
		}
		inputCmd.Stderr = os.Stderr
		if err := inputCmd.Start(); err != nil {
			slog.Error("native sim ws: input start failed", "error", err)
			inputCmd = nil
			return
		}
		slog.Info("native sim ws: input started", "pid", inputCmd.Process.Pid)
	}

	done := make(chan struct{})

	// Read input events from browser → pipe to sim-input stdin
	go func() {
		defer close(done)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			// First byte is tag (0x03=touch, 0x04=button, etc.), rest is JSON
			if len(msg) < 2 {
				continue
			}
			tag := msg[0]
			payload := msg[1:]

			var evt map[string]any
			if err := json.Unmarshal(payload, &evt); err != nil {
				continue
			}

			// Convert serve-sim wire format to sim-input NDJSON
			switch tag {
			case 0x03: // TOUCH
				phase, _ := evt["type"].(string)
				simPhase := "down"
				if phase == "move" {
					simPhase = "move"
				} else if phase == "end" {
					simPhase = "up"
				}
				evt = map[string]any{"type": "touch", "phase": simPhase, "x": evt["x"], "y": evt["y"]}
			case 0x04: // BUTTON
				name, _ := evt["button"].(string)
				evt = map[string]any{"type": "button-tap", "name": name}
			case 0x06: // KEY
				keyType, _ := evt["type"].(string)
				usage, _ := evt["usage"].(float64)
				evt = map[string]any{"type": "key", "phase": keyType, "usage": int(usage)}
			default:
				continue
			}

			ensureInput()
			inputMu.Lock()
			if inputStdin != nil {
				line, _ := json.Marshal(evt)
				inputStdin.Write(append(line, '\n'))
			}
			inputMu.Unlock()
		}
	}()

	// Read frames from sim-capture stdout → send as binary WS messages
	reader := captureStdout
	lenBuf := make([]byte, 4)
	for {
		// Read 4-byte big-endian length prefix
		if _, err := io.ReadFull(reader, lenBuf); err != nil {
			break
		}
		frameLen := binary.BigEndian.Uint32(lenBuf)
		if frameLen > 10*1024*1024 { // sanity: max 10MB frame
			break
		}
		frame := make([]byte, frameLen)
		if _, err := io.ReadFull(reader, frame); err != nil {
			break
		}
		// Send JPEG frame as binary WebSocket message
		if err := conn.WriteMessage(websocket.BinaryMessage, frame); err != nil {
			break
		}
	}

	// Cleanup
	<-done
	inputMu.Lock()
	if inputCmd != nil {
		inputCmd.Process.Signal(syscall.SIGTERM)
		go inputCmd.Wait()
	}
	inputMu.Unlock()
}
