package daemon

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// fallbackDevPorts is used when lsof/ss is unavailable.
var fallbackDevPorts = []int{3000, 3001, 4000, 4173, 5173, 8000, 8080, 8888, 9000}

// excludedPorts are ports to skip even if they respond to HTTP.
var excludedPorts = map[int]bool{
	// Databases
	3306: true, 5432: true, 5433: true,
	6379: true, 6380: true,
	27017: true, 27018: true,
	9200: true, 9300: true,
	// macOS system services (AirPlay, Bonjour, etc.)
	5000: true, 7000: true, 7001: true,
	// multica daemon health endpoint
	19514: true,
}

var listenPortRe = regexp.MustCompile(`:(\d+)\s*\(LISTEN\)`)

// webPreviewLoop detects running local dev servers and maintains a relay
// WebSocket to the VPS per (workspace, port) pair so browsers can see the
// site via /api/webpreview/{workspaceId}/*.
func (d *Daemon) webPreviewLoop(ctx context.Context) {
	type runner struct {
		cancel context.CancelFunc
		done   chan struct{}
	}
	// workspaceID -> port -> runner
	active := make(map[string]map[int]*runner)

	cleanup := func() {
		for _, portMap := range active {
			for _, r := range portMap {
				r.cancel()
				<-r.done
			}
		}
	}
	defer cleanup()

	sync := func() {
		wsIDs := d.allWorkspaceIDs()
		open := scanOpenDevPorts()

		wantWS := make(map[string]bool, len(wsIDs))
		for _, id := range wsIDs {
			wantWS[id] = true
		}

		// Start runners for new (workspace, port) pairs.
		for _, wsID := range wsIDs {
			if active[wsID] == nil {
				active[wsID] = make(map[int]*runner)
			}
			for _, port := range open {
				if _, exists := active[wsID][port]; !exists {
					rCtx, cancel := context.WithCancel(ctx)
					done := make(chan struct{})
					ws, p := wsID, port
					go func() {
						defer close(done)
						d.runWebPreviewRelay(rCtx, ws, p)
					}()
					active[wsID][port] = &runner{cancel: cancel, done: done}
					d.logger.Info("webpreview relay: started", "workspace_id", wsID, "port", port)
				}
			}
			// Stop runners for ports no longer open.
			openSet := make(map[int]bool, len(open))
			for _, p := range open {
				openSet[p] = true
			}
			for port, r := range active[wsID] {
				if !openSet[port] {
					r.cancel()
					<-r.done
					delete(active[wsID], port)
					d.logger.Info("webpreview relay: stopped (port closed)", "workspace_id", wsID, "port", port)
				}
			}
		}

		// Stop runners for workspaces no longer watched.
		for wsID, portMap := range active {
			if !wantWS[wsID] {
				for _, r := range portMap {
					r.cancel()
					<-r.done
				}
				delete(active, wsID)
			}
		}
	}

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	sync()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sync()
		}
	}
}

// scanOpenDevPorts returns local ports that are both listening and respond to HTTP.
// Uses lsof to discover all listeners, then filters to HTTP-speaking ones.
func scanOpenDevPorts() []int {
	candidates := collectListeningPorts()
	return filterHTTPPorts(candidates)
}

// collectListeningPorts returns all TCP ports >= 1024 that have a listener,
// using lsof when available and falling back to a fixed list.
func collectListeningPorts() []int {
	out, err := exec.Command("lsof", "-iTCP", "-sTCP:LISTEN", "-Pn").Output()
	if err != nil {
		return fallbackDevPorts
	}
	portSet := make(map[int]bool)
	for _, line := range strings.Split(string(out), "\n") {
		m := listenPortRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		var port int
		fmt.Sscanf(m[1], "%d", &port)
		// Accept ports in typical dev-server range; skip very high ephemeral ports.
		if port >= 1024 && port <= 30000 && !excludedPorts[port] {
			portSet[port] = true
		}
	}
	ports := make([]int, 0, len(portSet))
	for p := range portSet {
		ports = append(ports, p)
	}
	return ports
}

// filterHTTPPorts keeps only ports that respond to an HTTP request.
// All checks run concurrently so total time ≈ one timeout regardless of count.
func filterHTTPPorts(candidates []int) []int {
	if len(candidates) == 0 {
		return nil
	}
	httpClient := &http.Client{
		Timeout: 300 * time.Millisecond,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	var mu sync.Mutex
	var open []int
	var wg sync.WaitGroup
	for _, port := range candidates {
		wg.Add(1)
		go func(p int) {
			defer wg.Done()
			resp, err := httpClient.Get(fmt.Sprintf("http://127.0.0.1:%d/", p))
			if err != nil {
				return
			}
			resp.Body.Close()
			mu.Lock()
			open = append(open, p)
			mu.Unlock()
		}(port)
	}
	wg.Wait()
	sort.Ints(open)
	return open
}

// runWebPreviewRelay maintains a relay for one workspace+port with reconnect.
func (d *Daemon) runWebPreviewRelay(ctx context.Context, workspaceID string, port int) {
	backoff := 2 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		// Bail if port is no longer open — the outer loop will clean us up.
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 100*time.Millisecond)
		if err != nil {
			return
		}
		conn.Close()

		if err := d.serveWebPreviewRelay(ctx, workspaceID, port); err != nil && ctx.Err() == nil {
			d.logger.Debug("webpreview relay: disconnected, retrying",
				"workspace_id", workspaceID, "port", port, "error", err, "in", backoff)
		}
		if ctx.Err() != nil {
			return
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

// serveWebPreviewRelay opens one relay WebSocket and handles proxied HTTP requests.
func (d *Daemon) serveWebPreviewRelay(ctx context.Context, workspaceID string, port int) error {
	wsURL, err := webPreviewRelayURL(d.cfg.ServerBaseURL, workspaceID, port)
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

	d.logger.Info("webpreview relay: connected", "workspace_id", workspaceID, "port", port)

	var writeMu sync.Mutex
	writeMsg := func(v any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(v)
	}

	// Keepalive: respond to server pings with pong.
	conn.SetPingHandler(func(data string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(websocket.PongMessage, []byte(data))
	})

	httpClient := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse // let browser follow redirects
		},
	}

	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			return err
		}

		var req struct {
			Type    string            `json:"type"`
			ID      string            `json:"id"`
			Method  string            `json:"method"`
			Path    string            `json:"path"`
			Query   string            `json:"query"`
			Headers map[string]string `json:"headers"`
		}
		if err := json.Unmarshal(data, &req); err != nil || req.Type != "req" || req.ID == "" {
			continue
		}

		go func() {
			targetURL := fmt.Sprintf("http://127.0.0.1:%d%s", port, req.Path)
			if req.Query != "" {
				targetURL += "?" + req.Query
			}

			httpReq, err := http.NewRequestWithContext(ctx, req.Method, targetURL, nil)
			if err != nil {
				_ = writeMsg(map[string]any{"type": "res", "id": req.ID, "status": 502, "headers": map[string]string{}, "body": ""})
				return
			}
			for k, v := range req.Headers {
				if v != "" {
					httpReq.Header.Set(k, v)
				}
			}
			httpReq.Header.Set("Host", fmt.Sprintf("127.0.0.1:%d", port))

			httpResp, err := httpClient.Do(httpReq)
			if err != nil {
				_ = writeMsg(map[string]any{"type": "res", "id": req.ID, "status": 502, "headers": map[string]string{}, "body": ""})
				return
			}
			defer httpResp.Body.Close()

			body, _ := io.ReadAll(io.LimitReader(httpResp.Body, 10*1024*1024))
			hdrs := make(map[string]string, len(httpResp.Header))
			for k := range httpResp.Header {
				hdrs[k] = httpResp.Header.Get(k)
			}

			_ = writeMsg(map[string]any{
				"type":    "res",
				"id":      req.ID,
				"status":  httpResp.StatusCode,
				"headers": hdrs,
				"body":    base64.StdEncoding.EncodeToString(body),
			})
		}()
	}
}

func webPreviewRelayURL(baseURL, workspaceID string, port int) (string, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("invalid server URL: %w", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/webpreview/relay"
	q := u.Query()
	q.Set("workspace_id", workspaceID)
	q.Set("port", fmt.Sprintf("%d", port))
	u.RawQuery = q.Encode()
	return u.String(), nil
}
