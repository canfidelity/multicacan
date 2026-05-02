package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/realtime"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// StartPairSession creates an active pair session for an issue.
// POST /api/issues/{id}/pair/start
func (h *Handler) StartPairSession(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "id")
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())

	var req struct {
		AgentID   string `json:"agent_id"`
		RuntimeID string `json:"runtime_id"`
		Intervene bool   `json:"intervene"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AgentID == "" {
		writeError(w, http.StatusBadRequest, "agent_id required")
		return
	}

	// Verify issue belongs to workspace
	issue, err := h.Queries.GetIssue(r.Context(), parseUUID(issueID))
	if err != nil || uuidToString(issue.WorkspaceID) != wsID {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}

	// Verify agent belongs to workspace
	agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{
		ID:          parseUUID(req.AgentID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "agent not found")
		return
	}

	var runtimeID pgtype.UUID
	if req.RuntimeID != "" {
		runtimeID = parseUUID(req.RuntimeID)
	} else if agent.RuntimeID.Valid {
		runtimeID = agent.RuntimeID
	}

	// End any existing active session for this issue first
	_, _ = h.Queries.EndPairSessionByIssue(r.Context(), parseUUID(issueID))

	// Auto-resolve work_dir from the most recent task on this issue.
	// The pair agent needs to watch the same directory the worker agent is using.
	var workDir pgtype.Text
	if lastTask, err := h.Queries.GetLastTaskSession(r.Context(), db.GetLastTaskSessionParams{
		AgentID: parseUUID(req.AgentID),
		IssueID: parseUUID(issueID),
	}); err == nil {
		workDir = lastTask.WorkDir
	}

	session, err := h.Queries.CreatePairSession(r.Context(), db.CreatePairSessionParams{
		WorkspaceID: parseUUID(wsID),
		IssueID:     parseUUID(issueID),
		AgentID:     parseUUID(req.AgentID),
		StartedBy:   parseUUID(userID),
		RuntimeID:   runtimeID,
		WorkDir:     workDir,
		Intervene:   req.Intervene,
	})
	if err != nil {
		slog.Error("pair: create session failed", "error", err)
		writeError(w, http.StatusInternalServerError, "create session failed")
		return
	}

	// Broadcast pair:started to workspace
	h.broadcastPairEvent(wsID, protocol.EventPairStarted, protocol.PairStartedPayload{
		SessionID: uuidToString(session.ID),
		IssueID:   issueID,
		AgentID:   req.AgentID,
		StartedBy: userID,
	})

	writeJSON(w, http.StatusCreated, session)
}

// EndPairSession ends an active pair session.
// POST /api/issues/{id}/pair/end
func (h *Handler) EndPairSession(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "id")
	wsID := ctxWorkspaceID(r.Context())

	// Verify issue belongs to workspace
	issue, err := h.Queries.GetIssue(r.Context(), parseUUID(issueID))
	if err != nil || uuidToString(issue.WorkspaceID) != wsID {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}

	sessions, err := h.Queries.EndPairSessionByIssue(r.Context(), parseUUID(issueID))
	if err != nil {
		slog.Error("pair: end session failed", "error", err)
		writeError(w, http.StatusInternalServerError, "end session failed")
		return
	}

	for _, s := range sessions {
		h.broadcastPairEvent(wsID, protocol.EventPairEnded, protocol.PairEndedPayload{
			SessionID: uuidToString(s.ID),
			IssueID:   issueID,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"ended": len(sessions)})
}

// GetActivePairSession returns the current active pair session for an issue (if any).
// GET /api/issues/{id}/pair
func (h *Handler) GetActivePairSession(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "id")
	wsID := ctxWorkspaceID(r.Context())

	issue, err := h.Queries.GetIssue(r.Context(), parseUUID(issueID))
	if err != nil || uuidToString(issue.WorkspaceID) != wsID {
		writeError(w, http.StatusNotFound, "issue not found")
		return
	}

	session, err := h.Queries.GetActivePairSessionForIssue(r.Context(), parseUUID(issueID))
	if err != nil {
		// No active session — return null
		writeJSON(w, http.StatusOK, nil)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

// ListPairSuggestions returns suggestions for a pair session.
// GET /api/pair-sessions/{sessionId}/suggestions
func (h *Handler) ListPairSuggestions(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")

	suggestions, err := h.Queries.ListPairSuggestions(r.Context(), parseUUID(sessionID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list suggestions failed")
		return
	}
	if suggestions == nil {
		suggestions = []db.PairSuggestion{}
	}
	writeJSON(w, http.StatusOK, suggestions)
}

// DaemonClaimPairSession is called by the daemon to register work_dir for a session.
// POST /api/daemon/pair-sessions/{sessionId}/claim
func (h *Handler) DaemonClaimPairSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")

	var req protocol.DaemonPairClaimPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.WorkDir == "" {
		writeError(w, http.StatusBadRequest, "work_dir required")
		return
	}

	session, err := h.Queries.ClaimPairSession(r.Context(), db.ClaimPairSessionParams{
		ID:      parseUUID(sessionID),
		WorkDir: pgTextFromString(req.WorkDir),
	})
	if err != nil {
		slog.Error("pair: daemon claim failed", "session_id", sessionID, "error", err)
		writeError(w, http.StatusInternalServerError, "claim failed")
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// DaemonPostPairSuggestion is called by the daemon to submit a suggestion.
// POST /api/daemon/pair-sessions/{sessionId}/suggestions
func (h *Handler) DaemonPostPairSuggestion(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")

	var req protocol.DaemonPairSuggestionPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		writeError(w, http.StatusBadRequest, "content required")
		return
	}

	// Update diff hash to prevent reposting the same diff
	if req.DiffHash != "" {
		_, _ = h.Queries.UpdatePairSessionDiffHash(r.Context(), db.UpdatePairSessionDiffHashParams{
			ID:           parseUUID(sessionID),
			LastDiffHash: pgTextFromString(req.DiffHash),
		})
	}

	suggestion, err := h.Queries.CreatePairSuggestion(r.Context(), db.CreatePairSuggestionParams{
		PairSessionID: parseUUID(sessionID),
		DiffSnippet:   req.DiffSnippet,
		Content:       req.Content,
	})
	if err != nil {
		slog.Error("pair: create suggestion failed", "session_id", sessionID, "error", err)
		writeError(w, http.StatusInternalServerError, "create suggestion failed")
		return
	}

	// Look up session to get workspace_id and issue_id for broadcast
	session, err := h.Queries.GetPairSession(r.Context(), parseUUID(sessionID))
	if err == nil {
		h.broadcastPairEvent(uuidToString(session.WorkspaceID), protocol.EventPairSuggestion, protocol.PairSuggestionPayload{
			SuggestionID: uuidToString(suggestion.ID),
			SessionID:    sessionID,
			IssueID:      uuidToString(session.IssueID),
			DiffSnippet:  req.DiffSnippet,
			Content:      req.Content,
			CreatedAt:    suggestion.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	writeJSON(w, http.StatusCreated, suggestion)
}

// DaemonListActivePairSessions returns active pair sessions for a runtime.
// GET /api/daemon/runtimes/{runtimeId}/pair-sessions
func (h *Handler) DaemonListActivePairSessions(w http.ResponseWriter, r *http.Request) {
	runtimeID := chi.URLParam(r, "runtimeId")
	if _, ok := h.requireDaemonRuntimeAccess(w, r, runtimeID); !ok {
		return
	}

	sessions, err := h.Queries.ListActivePairSessionsByRuntime(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list sessions failed")
		return
	}
	if sessions == nil {
		sessions = []db.PairSession{}
	}
	writeJSON(w, http.StatusOK, sessions)
}

// DaemonPostPairIntervention stores an intervention from the pair agent to be injected
// into the worker agent's next task prompt.
// POST /api/daemon/pair-sessions/{sessionId}/intervention
func (h *Handler) DaemonPostPairIntervention(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")

	var req struct {
		IssueID string `json:"issue_id"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" || req.IssueID == "" {
		writeError(w, http.StatusBadRequest, "issue_id and content required")
		return
	}

	intervention, err := h.Queries.CreatePairIntervention(r.Context(), db.CreatePairInterventionParams{
		SessionID: parseUUID(sessionID),
		IssueID:   parseUUID(req.IssueID),
		Content:   req.Content,
	})
	if err != nil {
		slog.Error("pair: create intervention failed", "session_id", sessionID, "error", err)
		writeError(w, http.StatusInternalServerError, "create intervention failed")
		return
	}

	writeJSON(w, http.StatusCreated, intervention)
}

// DaemonConsumeIssueInterventions returns all unconsumed interventions for an issue
// and marks them as consumed. Called by the daemon before spawning a task.
// POST /api/daemon/issues/{issueId}/interventions/consume
func (h *Handler) DaemonConsumeIssueInterventions(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "issueId")

	interventions, err := h.Queries.ConsumeIssueInterventions(r.Context(), parseUUID(issueID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "consume interventions failed")
		return
	}
	if interventions == nil {
		interventions = []db.PairIntervention{}
	}
	writeJSON(w, http.StatusOK, interventions)
}

// broadcastPairEvent marshals a pair event and fans it out to the workspace.
func (h *Handler) broadcastPairEvent(workspaceID string, eventType string, payload any) {
	data, err := json.Marshal(map[string]any{
		"type":    eventType,
		"payload": payload,
	})
	if err != nil {
		return
	}
	h.Hub.BroadcastToScope(realtime.ScopeWorkspace, workspaceID, data)
}

// pgTextFromString converts a Go string to pgtype.Text.
func pgTextFromString(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}