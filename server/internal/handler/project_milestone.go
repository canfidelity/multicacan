package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
	"github.com/canfidelity/multicacan/server/internal/util"
)

type ProjectMilestoneResponse struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	WorkspaceID string  `json:"workspace_id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	IssueID     *string `json:"issue_id"`
	Position    int32   `json:"position"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func milestoneToResponse(m db.ProjectMilestone) ProjectMilestoneResponse {
	return ProjectMilestoneResponse{
		ID:          uuidToString(m.ID),
		ProjectID:   uuidToString(m.ProjectID),
		WorkspaceID: uuidToString(m.WorkspaceID),
		Title:       m.Title,
		Description: m.Description,
		Status:      m.Status,
		IssueID:     uuidToPtr(m.IssueID),
		Position:    m.Position,
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
	}
}

func (h *Handler) ListProjectMilestones(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	projectUUID, ok := parseUUIDOrBadRequest(w, id, "project id")
	if !ok {
		return
	}
	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
		ID: projectUUID, WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	rows, err := h.Queries.ListProjectMilestones(r.Context(), projectUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list milestones")
		return
	}
	resp := make([]ProjectMilestoneResponse, len(rows))
	for i, m := range rows {
		resp[i] = milestoneToResponse(m)
	}
	writeJSON(w, http.StatusOK, resp)
}

type CreateMilestoneRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	IssueID     *string `json:"issue_id"`
}

func (h *Handler) CreateProjectMilestone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	projectUUID, ok := parseUUIDOrBadRequest(w, id, "project id")
	if !ok {
		return
	}
	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	if _, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
		ID: projectUUID, WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "project not found")
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
		issueID, ok = parseUUIDOrBadRequest(w, *req.IssueID, "issue_id")
		if !ok {
			return
		}
	}
	m, err := h.Queries.CreateProjectMilestone(r.Context(), db.CreateProjectMilestoneParams{
		ProjectID:   projectUUID,
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

type UpdateMilestoneRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	IssueID     *string `json:"issue_id"`
	Position    *int32  `json:"position"`
}

func (h *Handler) UpdateProjectMilestone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	milestoneID := chi.URLParam(r, "milestoneId")
	projectUUID, ok := parseUUIDOrBadRequest(w, id, "project id")
	if !ok {
		return
	}
	milestoneUUID, ok := parseUUIDOrBadRequest(w, milestoneID, "milestone id")
	if !ok {
		return
	}
	var req UpdateMilestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	existing, err := h.Queries.GetProjectMilestone(r.Context(), milestoneUUID)
	if err != nil || uuidToString(existing.ProjectID) != uuidToString(projectUUID) {
		writeError(w, http.StatusNotFound, "milestone not found")
		return
	}
	params := db.UpdateProjectMilestoneParams{
		ID: milestoneUUID,
	}
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
	if req.Position != nil {
		params.Position = pgtype.Int4{Int32: *req.Position, Valid: true}
	}
	m, err := h.Queries.UpdateProjectMilestone(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update milestone")
		return
	}
	writeJSON(w, http.StatusOK, milestoneToResponse(m))
}

func (h *Handler) DeleteProjectMilestone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	milestoneID := chi.URLParam(r, "milestoneId")
	projectUUID, ok := parseUUIDOrBadRequest(w, id, "project id")
	if !ok {
		return
	}
	milestoneUUID, ok := parseUUIDOrBadRequest(w, milestoneID, "milestone id")
	if !ok {
		return
	}
	n, err := h.Queries.DeleteProjectMilestone(r.Context(), db.DeleteProjectMilestoneParams{
		ID:        milestoneUUID,
		ProjectID: projectUUID,
	})
	if err != nil || n == 0 {
		writeError(w, http.StatusNotFound, "milestone not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type SetExecutionRequest struct {
	Status string `json:"status"`
}

// SetProjectExecution handles start/pause/stop/resume for a project's autonomous roadmap execution.
func (h *Handler) SetProjectExecution(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workspaceID := h.resolveWorkspaceID(r)
	projectUUID, ok := parseUUIDOrBadRequest(w, id, "project id")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	project, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
		ID: projectUUID, WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	var req SetExecutionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	switch req.Status {
	case "running", "paused", "stopped", "idle":
	default:
		writeError(w, http.StatusBadRequest, "status must be running, paused, stopped, or idle")
		return
	}

	updated, err := h.Queries.SetProjectExecutionStatus(r.Context(), db.SetProjectExecutionStatusParams{
		ID:              projectUUID,
		ExecutionStatus: req.Status,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update execution status")
		return
	}

	// When starting, auto-set mission_issue_id if not set (first issue in project)
	// and trigger the squad leader on that issue.
	if req.Status == "running" && !project.MissionIssueID.Valid {
		if firstIssue, err := h.Queries.GetFirstIssueInProject(r.Context(), projectUUID); err == nil {
			if _, err := h.Queries.SetProjectMissionIssue(r.Context(), db.SetProjectMissionIssueParams{
				ID:             projectUUID,
				MissionIssueID: firstIssue.ID,
			}); err == nil {
				updated.MissionIssueID = firstIssue.ID
			}
		}
	}

	// Trigger squad leader on mission issue when starting
	if req.Status == "running" && updated.MissionIssueID.Valid {
		if missionIssue, err := h.Queries.GetIssue(r.Context(), updated.MissionIssueID); err == nil {
			if missionIssue.AssigneeType.String == "squad" && missionIssue.AssigneeID.Valid {
				h.enqueueSquadLeaderTask(r.Context(), missionIssue, pgtype.UUID{}, "member", "")
			}
		}
	}

	resp := projectToResponse(updated)
	userID, _ := requireUserID(w, r)
	_ = userID
	writeJSON(w, http.StatusOK, resp)
}

// TriggerNextMilestone is called when a milestone issue completes. It marks the
// milestone done, checks if the project is running, and triggers the squad
// leader on the mission issue to pick up the next milestone.
func (h *Handler) TriggerNextMilestone(ctx context.Context, issueID pgtype.UUID) {
	milestone, err := h.Queries.GetProjectMilestoneByIssue(ctx, issueID)
	if err != nil {
		return
	}

	// Mark milestone done
	doneStatus := pgtype.Text{String: "done", Valid: true}
	if _, err := h.Queries.UpdateProjectMilestone(ctx, db.UpdateProjectMilestoneParams{
		ID:     milestone.ID,
		Status: doneStatus,
	}); err != nil {
		slog.Warn("roadmap: failed to mark milestone done", "milestone_id", uuidToString(milestone.ID), "error", err)
		return
	}

	// Check project execution status
	project, err := h.Queries.GetProject(ctx, milestone.ProjectID)
	if err != nil || project.ExecutionStatus != "running" {
		return
	}

	// Check if all milestones are done → mark project completed
	pending, err := h.Queries.CountPendingMilestones(ctx, milestone.ProjectID)
	if err != nil {
		return
	}
	if pending == 0 {
		if _, err := h.Queries.SetProjectExecutionStatus(ctx, db.SetProjectExecutionStatusParams{
			ID:              milestone.ProjectID,
			ExecutionStatus: "completed",
		}); err != nil {
			slog.Warn("roadmap: failed to mark project completed", "project_id", uuidToString(milestone.ProjectID), "error", err)
		}
		return
	}

	// Trigger squad leader on mission issue to pick next milestone
	if !project.MissionIssueID.Valid {
		return
	}
	missionIssue, err := h.Queries.GetIssue(ctx, project.MissionIssueID)
	if err != nil {
		return
	}
	if missionIssue.AssigneeType.String == "squad" && missionIssue.AssigneeID.Valid {
		h.enqueueSquadLeaderTask(ctx, missionIssue, pgtype.UUID{}, "system", "")
		slog.Info("roadmap: triggered squad leader for next milestone",
			"project_id", uuidToString(milestone.ProjectID),
			"mission_issue_id", util.UUIDToString(project.MissionIssueID),
			"pending_milestones", pending,
		)
	}
}
