package handler

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

const ideUpstreamURL = "http://172.18.0.1:18080"

// IDEProxy proxies browser requests to the local openvscode-server instance.
// Handles both plain HTTP and WebSocket upgrade requests.
// GET|* /api/ide/{workspaceId}/*
func (h *Handler) IDEProxy(w http.ResponseWriter, r *http.Request) {
	upstream, _ := url.Parse(ideUpstreamURL)

	// Rewrite path: strip /api/ide/{workspaceId} prefix.
	wsID := chi.URLParam(r, "workspaceId")
	prefix := "/api/ide/" + wsID
	targetPath := strings.TrimPrefix(r.URL.Path, prefix)
	if targetPath == "" {
		targetPath = "/"
	}

	// WebSocket upgrade: tunnel directly to openvscode-server.
	if isWebSocketUpgrade(r) {
		h.ideWSProxy(w, r, targetPath)
		return
	}

	// Plain HTTP: reverse proxy.
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = upstream.Scheme
			req.URL.Host = upstream.Host
			req.URL.Path = targetPath
			req.URL.RawQuery = r.URL.RawQuery
			req.Host = upstream.Host
			// Remove headers that could break the upstream.
			req.Header.Del("X-Forwarded-Proto")
		},
		ModifyResponse: func(resp *http.Response) error {
			// Allow embedding in our SidebarInset iframe.
			resp.Header.Del("X-Frame-Options")
			resp.Header.Del("Content-Security-Policy")
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			slog.Debug("ide proxy: upstream error", "error", err)
			http.Error(w, "IDE unavailable", http.StatusBadGateway)
		},
	}
	proxy.ServeHTTP(w, r)
}

// ideWSProxy tunnels a WebSocket connection from the browser to openvscode-server.
func (h *Handler) ideWSProxy(w http.ResponseWriter, r *http.Request, targetPath string) {
	// Connect to openvscode-server WebSocket.
	targetWS := "ws://172.18.0.1:18080" + targetPath
	if r.URL.RawQuery != "" {
		targetWS += "?" + r.URL.RawQuery
	}

	upstreamHeaders := http.Header{}
	for _, k := range []string{"Sec-Websocket-Protocol", "Sec-Websocket-Extensions"} {
		if v := r.Header.Get(k); v != "" {
			upstreamHeaders.Set(k, v)
		}
	}

	upstreamConn, _, err := websocket.DefaultDialer.Dial(targetWS, upstreamHeaders)
	if err != nil {
		slog.Debug("ide proxy: ws dial failed", "target", targetWS, "error", err)
		http.Error(w, "IDE WebSocket unavailable", http.StatusBadGateway)
		return
	}
	defer upstreamConn.Close()

	// Upgrade browser connection.
	browserConn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Debug("ide proxy: browser upgrade failed", "error", err)
		return
	}
	defer browserConn.Close()

	// Bidirectional pump.
	done := make(chan struct{}, 2)
	pump := func(dst, src *websocket.Conn) {
		defer func() { done <- struct{}{} }()
		for {
			msgType, data, err := src.ReadMessage()
			if err != nil {
				return
			}
			if err := dst.WriteMessage(msgType, data); err != nil {
				return
			}
		}
	}

	go pump(upstreamConn, browserConn)
	go pump(browserConn, upstreamConn)
	<-done
}

// IDEStatus reports whether openvscode-server is reachable.
// GET /api/ide/status
func (h *Handler) IDEStatus(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Get(ideUpstreamURL + "/")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"active": false})
		return
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	writeJSON(w, http.StatusOK, map[string]any{"active": resp.StatusCode < 500})
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}
