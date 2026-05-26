package handler

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

// GetDaemonProjectMilestones returns the milestone list for the project
// associated with the current task's issue. Intended for squad leaders to
// read the roadmap before deciding what to delegate next.
func (h *Handler) GetDaemonProjectMilestones(w http.ResponseWriter, r *http.Request) {
	taskID := r.Header.Get("X-Task-ID")
	task, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}
	if !task.IssueID.Valid {
		writeError(w, http.StatusBadRequest, "task has no associated issue")
		return
	}
	issue, err := h.Queries.GetIssue(r.Context(), task.IssueID)
	if err != nil || !issue.ProjectID.Valid {
		writeError(w, http.StatusNotFound, "issue has no associated project")
		return
	}
	milestones, err := h.Queries.ListProjectMilestones(r.Context(), issue.ProjectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list milestones")
		return
	}
	resp := make([]ProjectMilestoneResponse, len(milestones))
	for i, m := range milestones {
		resp[i] = milestoneToResponse(m)
	}
	writeJSON(w, http.StatusOK, resp)
}

// CreateDaemonProjectMilestone lets a squad leader agent add a new milestone
// to the project roadmap during planning.
func (h *Handler) CreateDaemonProjectMilestone(w http.ResponseWriter, r *http.Request) {
	taskID := r.Header.Get("X-Task-ID")
	task, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}
	if !task.IssueID.Valid {
		writeError(w, http.StatusBadRequest, "task has no associated issue")
		return
	}
	issue, err := h.Queries.GetIssue(r.Context(), task.IssueID)
	if err != nil || !issue.ProjectID.Valid {
		writeError(w, http.StatusNotFound, "issue has no associated project")
		return
	}
	var req CreateMilestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	var issueID pgtype.UUID
	if req.IssueID != nil {
		var ok bool
		issueID, ok = parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
		if !ok {
			return
		}
	}
	m, err := h.Queries.CreateProjectMilestone(r.Context(), db.CreateProjectMilestoneParams{
		ProjectID:   issue.ProjectID,
		Title:       req.Title,
		Description: req.Description,
		IssueID:     issueID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create milestone")
		return
	}
	writeJSON(w, http.StatusCreated, milestoneToResponse(m))
}

// UpdateDaemonProjectMilestone lets a squad leader agent update a milestone
// (e.g., mark it in_progress when delegating, or link it to a created issue).
func (h *Handler) UpdateDaemonProjectMilestone(w http.ResponseWriter, r *http.Request) {
	taskID := r.Header.Get("X-Task-ID")
	_, ok := h.requireDaemonTaskAccess(w, r, taskID)
	if !ok {
		return
	}
	milestoneID := r.URL.Query().Get("id")
	if milestoneID == "" {
		writeError(w, http.StatusBadRequest, "id query param required")
		return
	}
	milestoneUUID, ok := parseUUIDOrBadRequest(w, milestoneID, "id")
	if !ok {
		return
	}
	var req UpdateMilestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	params := db.UpdateProjectMilestoneParams{ID: milestoneUUID}
	if req.Title != nil {
		params.Title = pgtype.Text{String: *req.Title, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.Status != nil {
		params.Status = pgtype.Text{String: *req.Status, Valid: true}
	}
	if req.IssueID != nil {
		issueUUID, ok := parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
		if !ok {
			return
		}
		params.IssueID = issueUUID
	}
	m, err := h.Queries.UpdateProjectMilestone(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update milestone")
		return
	}
	writeJSON(w, http.StatusOK, milestoneToResponse(m))
}
