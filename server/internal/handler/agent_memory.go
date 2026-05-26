package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

type AgentMemoryResponse struct {
	ID          string  `json:"id"`
	AgentID     string  `json:"agent_id"`
	WorkspaceID string  `json:"workspace_id"`
	Key         string  `json:"key"`
	Value       string  `json:"value"`
	Description string  `json:"description"`
	IssueID     *string `json:"issue_id"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func agentMemoryToResponse(m db.AgentMemory) AgentMemoryResponse {
	return AgentMemoryResponse{
		ID:          uuidToString(m.ID),
		AgentID:     uuidToString(m.AgentID),
		WorkspaceID: uuidToString(m.WorkspaceID),
		Key:         m.Key,
		Value:       m.Value,
		Description: m.Description,
		IssueID:     uuidToPtr(m.IssueID),
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
	}
}

// ---------------------------------------------------------------------------
// Daemon-facing handlers — agent identity comes from the calling task.
// ---------------------------------------------------------------------------

// GetDaemonMemory retrieves a single memory entry by key for the calling agent.
// The agent is identified via the X-Task-ID header; the task row carries AgentID.
func (h *Handler) GetDaemonMemory(w http.ResponseWriter, r *http.Request) {
	taskID := r.Header.Get("X-Task-ID")
	task, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}

	key := r.URL.Query().Get("key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	mem, err := h.Queries.GetAgentMemory(r.Context(), db.GetAgentMemoryParams{
		AgentID: task.AgentID,
		Key:     key,
	})
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "memory not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to get agent memory")
		return
	}

	writeJSON(w, http.StatusOK, agentMemoryToResponse(mem))
}

// UpsertDaemonMemory creates or updates a memory entry for the calling agent.
func (h *Handler) UpsertDaemonMemory(w http.ResponseWriter, r *http.Request) {
	taskID := r.Header.Get("X-Task-ID")
	task, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}

	var req struct {
		Key         string  `json:"key"`
		Value       string  `json:"value"`
		Description string  `json:"description"`
		IssueID     *string `json:"issue_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	var issueUUID pgtype.UUID
	if req.IssueID != nil {
		issueUUID, ok = parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
		if !ok {
			return
		}
	}

	mem, err := h.Queries.UpsertAgentMemory(r.Context(), db.UpsertAgentMemoryParams{
		WorkspaceID: wsUUID,
		AgentID:     task.AgentID,
		Key:         req.Key,
		Value:       req.Value,
		Description: req.Description,
		IssueID:     issueUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to upsert agent memory")
		return
	}

	writeJSON(w, http.StatusOK, agentMemoryToResponse(mem))
}

// DeleteDaemonMemory removes a memory entry by key for the calling agent.
func (h *Handler) DeleteDaemonMemory(w http.ResponseWriter, r *http.Request) {
	taskID := r.Header.Get("X-Task-ID")
	task, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}

	key := r.URL.Query().Get("key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	n, err := h.Queries.DeleteAgentMemory(r.Context(), db.DeleteAgentMemoryParams{
		AgentID: task.AgentID,
		Key:     key,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete agent memory")
		return
	}
	if n == 0 {
		writeError(w, http.StatusNotFound, "memory not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Management handlers — workspace member auth, agent identified by URL param.
// ---------------------------------------------------------------------------

// ListAgentMemories returns all memory entries for a given agent.
func (h *Handler) ListAgentMemories(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")
	agent, ok := h.loadAgentForUser(w, r, agentID)
	if !ok {
		return
	}

	memories, err := h.Queries.ListAgentMemories(r.Context(), agent.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list agent memories")
		return
	}

	resp := make([]AgentMemoryResponse, 0, len(memories))
	for _, m := range memories {
		resp = append(resp, agentMemoryToResponse(m))
	}
	writeJSON(w, http.StatusOK, resp)
}

// DeleteAgentMemory removes a specific memory entry by agent ID and key.
func (h *Handler) DeleteAgentMemory(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")
	agent, ok := h.loadAgentForUser(w, r, agentID)
	if !ok {
		return
	}

	key := chi.URLParam(r, "key")
	if key == "" {
		writeError(w, http.StatusBadRequest, "key is required")
		return
	}

	n, err := h.Queries.DeleteAgentMemory(r.Context(), db.DeleteAgentMemoryParams{
		AgentID: agent.ID,
		Key:     key,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete agent memory")
		return
	}
	if n == 0 {
		writeError(w, http.StatusNotFound, "memory not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
