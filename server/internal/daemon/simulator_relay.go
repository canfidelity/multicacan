package daemon

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// relaySimulatorLoop maintains an outbound WebSocket from this Mac Mini
// daemon to the VPS for each workspace this daemon serves. The VPS uses
// the connection to tunnel an iOS simulator stream to a browser anywhere.
//
// Per-workspace topology:
//
//   browser ── /api/simulator/native ──► VPS ──► /api/simulator/relay ── daemon ── sim-capture/sim-input
//
// One outbound connection is opened per registered workspace, with
// independent reconnect/backoff. Connections are torn down when the
// workspace is no longer watched. The implementation is a no-op on
// platforms where sim-capture isn't shipped (Linux/Windows VPS, etc.).
func (d *Daemon) relaySimulatorLoop(ctx context.Context) {
	// Bail early if there's no sim-capture binary on this machine — the
	// relay can't do anything useful without one and we don't want to
	// burn reconnect cycles forever on a server that just runs agents.
	if findDaemonSimHelper("sim-capture") == "" {
		d.logger.Debug("simulator relay: sim-capture not found; relay disabled")
		return
	}

	type runner struct {
		cancel context.CancelFunc
		done   chan struct{}
	}
	active := make(map[string]*runner)
	defer func() {
		for _, r := range active {
			r.cancel()
			<-r.done
		}
	}()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	syncRunners := func() {
		want := make(map[string]struct{})
		for _, id := range d.allWorkspaceIDs() {
			want[id] = struct{}{}
		}
		// Stop runners for workspaces no longer watched.
		for id, r := range active {
			if _, keep := want[id]; !keep {
				r.cancel()
				<-r.done
				delete(active, id)
			}
		}
		// Start runners for new workspaces.
		for id := range want {
			if _, exists := active[id]; exists {
				continue
			}
			runCtx, cancel := context.WithCancel(ctx)
			done := make(chan struct{})
			ws := id
			go func() {
				defer close(done)
				d.runSimulatorRelay(runCtx, ws)
			}()
			active[id] = &runner{cancel: cancel, done: done}
		}
	}

	syncRunners()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			syncRunners()
		}
	}
}

// allWorkspaceIDs returns a snapshot of currently-watched workspace IDs.
func (d *Daemon) allWorkspaceIDs() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	ids := make([]string, 0, len(d.workspaces))
	for id := range d.workspaces {
		ids = append(ids, id)
	}
	return ids
}

// runSimulatorRelay maintains a single relay connection for one workspace,
// reconnecting with exponential backoff on failure. Returns when ctx is
// cancelled (workspace removed or daemon shutting down).
func (d *Daemon) runSimulatorRelay(ctx context.Context, workspaceID string) {
	backoff := time.Second
	for {
		if err := ctx.Err(); err != nil {
			return
		}
		err := d.serveSimulatorRelay(ctx, workspaceID)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			d.logger.Debug("simulator relay disconnected, will retry",
				"workspace_id", workspaceID, "error", err, "retry_in", backoff)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
		}
	}
}

// serveSimulatorRelay opens one relay WebSocket and runs until either side
// disconnects or ctx is cancelled.
func (d *Daemon) serveSimulatorRelay(ctx context.Context, workspaceID string) error {
	wsURL, err := simulatorRelayURL(d.cfg.ServerBaseURL, workspaceID)
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
			return fmt.Errorf("dial relay (%d): %w", resp.StatusCode, err)
		}
		return fmt.Errorf("dial relay: %w", err)
	}
	defer conn.Close()

	d.logger.Info("simulator relay: connected", "workspace_id", workspaceID)

	session := &simRelaySession{
		logger: d.logger.With("workspace_id", workspaceID),
		conn:   conn,
	}
	defer session.stopHelpers()

	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		if msgType != websocket.TextMessage {
			// We don't expect binary input from the VPS.
			continue
		}
		var ctrl struct {
			Type    string `json:"type"`
			UDID    string `json:"udid,omitempty"`
			ReqID   string `json:"req_id,omitempty"`
			Command string `json:"command,omitempty"`
		}
		if err := json.Unmarshal(data, &ctrl); err != nil {
			session.logger.Debug("simulator relay: bad control msg", "error", err)
			continue
		}
		switch ctrl.Type {
		case "start":
			if err := session.start(ctrl.UDID); err != nil {
				session.logger.Warn("simulator relay: start failed", "error", err)
			}
		case "stop":
			session.stopHelpers()
		case "touch", "key":
			// Forward as-is; the VPS already converted these to the
			// exact NDJSON format sim-input expects.
			session.writeInputLine(data)
		case "button":
			// VPS sends {"type":"button","button":"<name>"} but
			// sim-input expects {"type":"button-tap","name":"<name>"}.
			var raw map[string]any
			if err := json.Unmarshal(data, &raw); err == nil {
				name, _ := raw["button"].(string)
				simEvt := map[string]any{"type": "button-tap", "name": name}
				if line, err := json.Marshal(simEvt); err == nil {
					session.writeInputLine(line)
				}
			}
		case "exec_req":
			if ctrl.ReqID != "" && ctrl.Command != "" {
				go session.handleExecReq(ctrl.ReqID, ctrl.Command)
			}
		default:
			// Unknown control type — ignore.
		}
	}
}

// simRelaySession owns the per-connection sim-capture / sim-input child
// processes. Restarted when the VPS sends "start" with a new UDID.
type simRelaySession struct {
	logger *slog.Logger
	conn   *websocket.Conn

	mu          sync.Mutex
	captureCmd  *exec.Cmd
	captureOut  io.ReadCloser
	inputCmd    *exec.Cmd
	inputStdin  io.WriteCloser
	stopFrame   chan struct{} // closed to signal the frame-forwarding goroutine to exit
	currentUDID string

	writeMu sync.Mutex // serializes WriteMessage on conn
}

// resolveUDID returns the real booted device UDID. If udid is empty, "relay",
// or any other placeholder, it queries xcrun simctl to find the booted device.
func resolveUDID(udid string) string {
	isPlaceholder := udid == "" || udid == "relay"
	if !isPlaceholder {
		return udid
	}
	out, err := exec.Command("xcrun", "simctl", "list", "devices", "booted", "-j").Output()
	if err != nil {
		return ""
	}
	var data struct {
		Devices map[string][]struct {
			UDID  string `json:"udid"`
			State string `json:"state"`
		} `json:"devices"`
	}
	if err := json.Unmarshal(out, &data); err != nil {
		return ""
	}
	for _, devs := range data.Devices {
		for _, d := range devs {
			if d.State == "Booted" {
				return d.UDID
			}
		}
	}
	return ""
}

// start (re)launches sim-capture for the given UDID and a sim-input pipe
// for backwards input forwarding.
func (s *simRelaySession) start(udid string) error {
	// Resolve placeholder UDIDs to the actual booted device.
	udid = resolveUDID(udid)

	s.mu.Lock()
	defer s.mu.Unlock()
	// If already running for the same UDID, nothing to do.
	if s.captureCmd != nil && s.currentUDID == udid {
		return nil
	}
	s.stopHelpersLocked()
	s.currentUDID = udid

	captureBin := findDaemonSimHelper("sim-capture")
	if captureBin == "" {
		return fmt.Errorf("sim-capture not found")
	}
	captureArgs := []string{}
	if udid != "" {
		captureArgs = append(captureArgs, "--udid", udid)
	}
	captureCmd := exec.Command(captureBin, captureArgs...)
	captureCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	out, err := captureCmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("capture stdout pipe: %w", err)
	}
	captureCmd.Stderr = os.Stderr
	if err := captureCmd.Start(); err != nil {
		return fmt.Errorf("capture start: %w", err)
	}
	s.captureCmd = captureCmd
	s.captureOut = out

	stopCh := make(chan struct{})
	s.stopFrame = stopCh
	go s.pumpFrames(out, stopCh)

	// Best-effort sim-input. Failure here just means inputs won't
	// reach the simulator; we keep streaming frames anyway.
	if inputBin := findDaemonSimHelper("sim-input"); inputBin != "" {
		inputArgs := []string{}
		if udid != "" {
			inputArgs = append(inputArgs, "--udid", udid)
		}
		inputCmd := exec.Command(inputBin, inputArgs...)
		inputCmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		stdin, err := inputCmd.StdinPipe()
		if err == nil {
			inputCmd.Stderr = os.Stderr
			if err := inputCmd.Start(); err == nil {
				s.inputCmd = inputCmd
				s.inputStdin = stdin
			}
		}
	}

	s.logger.Info("simulator relay: helpers started",
		"udid", udid,
		"capture_pid", captureCmd.Process.Pid)
	return nil
}

// pumpFrames reads length-prefixed JPEGs from sim-capture stdout and
// forwards each as a binary WebSocket message.
func (s *simRelaySession) pumpFrames(out io.Reader, stopCh <-chan struct{}) {
	lenBuf := make([]byte, 4)
	for {
		select {
		case <-stopCh:
			return
		default:
		}
		if _, err := io.ReadFull(out, lenBuf); err != nil {
			return
		}
		frameLen := binary.BigEndian.Uint32(lenBuf)
		if frameLen == 0 || frameLen > 10*1024*1024 {
			return
		}
		frame := make([]byte, frameLen)
		if _, err := io.ReadFull(out, frame); err != nil {
			return
		}
		s.writeMu.Lock()
		err := s.conn.WriteMessage(websocket.BinaryMessage, frame)
		s.writeMu.Unlock()
		if err != nil {
			return
		}
	}
}

// handleExecReq runs a shell command locally and sends the result back
// as an exec_res JSON message. Runs in its own goroutine.
func (s *simRelaySession) handleExecReq(reqID, command string) {
	cmd := exec.Command("sh", "-c", command)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}
	result := map[string]any{
		"type":      "exec_res",
		"req_id":    reqID,
		"stdout":    stdout.String(),
		"stderr":    stderr.String(),
		"exit_code": exitCode,
	}
	s.writeMu.Lock()
	_ = s.conn.WriteJSON(result)
	s.writeMu.Unlock()
}

// writeInputLine forwards a JSON control message from the VPS to the
// local sim-input helper. JSON-newline (NDJSON) is what sim-input expects.
func (s *simRelaySession) writeInputLine(line []byte) {
	s.mu.Lock()
	stdin := s.inputStdin
	s.mu.Unlock()
	if stdin == nil {
		return
	}
	if _, err := stdin.Write(append(line, '\n')); err != nil {
		s.logger.Debug("simulator relay: input write failed", "error", err)
	}
}

func (s *simRelaySession) stopHelpers() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopHelpersLocked()
}

func (s *simRelaySession) stopHelpersLocked() {
	if s.stopFrame != nil {
		close(s.stopFrame)
		s.stopFrame = nil
	}
	if s.captureOut != nil {
		s.captureOut.Close()
		s.captureOut = nil
	}
	if s.captureCmd != nil && s.captureCmd.Process != nil {
		_ = s.captureCmd.Process.Signal(syscall.SIGTERM)
		go s.captureCmd.Wait()
		s.captureCmd = nil
	}
	if s.inputStdin != nil {
		s.inputStdin.Close()
		s.inputStdin = nil
	}
	if s.inputCmd != nil && s.inputCmd.Process != nil {
		_ = s.inputCmd.Process.Signal(syscall.SIGTERM)
		go s.inputCmd.Wait()
		s.inputCmd = nil
	}
	s.currentUDID = ""
}

// simulatorRelayURL converts the daemon's HTTP base URL to the ws/wss
// scheme and appends the relay path with the workspace_id query param.
func simulatorRelayURL(baseURL, workspaceID string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("invalid daemon server URL: %w", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("daemon server URL must use http, https, ws, or wss")
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/simulator/relay"
	u.RawPath = ""
	q := u.Query()
	q.Set("workspace_id", workspaceID)
	u.RawQuery = q.Encode()
	u.Fragment = ""
	return u.String(), nil
}

// findDaemonSimHelper locates the bundled simulator helper binary. Mirrors
// the server-side findSimHelper but lives in the daemon package so the
// relay loop doesn't depend on internal/handler.
func findDaemonSimHelper(name string) string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(exe)
	candidates := []string{
		filepath.Join(dir, "sim-helpers", name),
		filepath.Join(dir, "..", "internal", "handler", "sim-helpers", name),
		filepath.Join("internal", "handler", "sim-helpers", name),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	// Fallback: PATH lookup so operators can install sim-capture system-wide.
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	return ""
}
