package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// DaemonHandoffTask registers a pending handoff from the running task to a
// named or UUID-identified agent. The handoff is processed (new task created)
// atomically when CompleteTask fires.
// POST /api/daemon/tasks/{taskId}/handoff
func (h *Handler) DaemonHandoffTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskId")

	var req struct {
		To      string `json:"to"`      // agent name or UUID
		Context string `json:"context"` // passed verbatim into the next task's prompt
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.To == "" {
		writeError(w, http.StatusBadRequest, "to is required")
		return
	}
	if len(req.Context) > 8000 {
		req.Context = req.Context[:8000]
	}

	taskUUID, ok := parseUUIDOrBadRequest(w, taskID, "taskId")
	if !ok {
		return
	}
	handoff, err := h.TaskService.HandoffTask(r.Context(), taskUUID, req.To, req.Context)
	if err != nil {
		slog.Error("handoff: register failed", "task_id", taskID, "to", req.To, "error", err)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, handoff)
}
