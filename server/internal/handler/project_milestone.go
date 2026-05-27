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

// triggerSquadLeaderOnTaskComplete is called when any agent task completes.
//
// For leader tasks: the leader just finished evaluating an issue. Drive the
// project forward by triggering the leader on the next pending (backlog/todo)
// issue in the project so work never stalls.
//
// For non-leader tasks: if the issue is still in a non-terminal state the
// agent didn't update the status, so re-trigger the leader to review.
func (h *Handler) triggerSquadLeaderOnTaskComplete(ctx context.Context, task db.AgentTaskQueue) {
	if !task.IssueID.Valid {
		return
	}
	issue, err := h.Queries.GetIssue(ctx, task.IssueID)
	if err != nil {
		return
	}

	if task.IsLeaderTask {
		h.triggerProjectLeaderContinuation(ctx, issue)
		return
	}

	// Non-leader task: if the issue is still open (agent didn't advance status),
	// trigger the leader to review and drive the next step.
	switch issue.Status {
	case "done", "in_review", "cancelled":
		return
	}
	h.triggerProjectSquadLeaderForReview(ctx, issue)
}

// triggerProjectLeaderContinuation is called after a leader task completes.
// It finds the next pending (backlog/todo) issue in the project and triggers
// the leader on it, so the autonomous loop continues without human intervention.
// The current issue is excluded to prevent the leader from looping on the same
// issue when it recorded no_action.
func (h *Handler) triggerProjectLeaderContinuation(ctx context.Context, issue db.Issue) {
	if !issue.ProjectID.Valid {
		return
	}
	project, err := h.Queries.GetProject(ctx, issue.ProjectID)
	if err != nil || project.ExecutionStatus != "running" {
		return
	}
	squadID, err := h.Queries.GetFirstProjectSquad(ctx, issue.ProjectID)
	if err != nil {
		return
	}
	squad, err := h.Queries.GetSquad(ctx, squadID)
	if err != nil {
		return
	}
	next, err := h.Queries.GetNextPendingIssueInProject(ctx, db.GetNextPendingIssueInProjectParams{
		ProjectID: issue.ProjectID,
		ID:        issue.ID,
	})
	if err != nil {
		// No backlog/todo issues left — fall back to in_review so the leader
		// can still act on work that completed but wasn't moved forward.
		next, err = h.Queries.GetNextReviewIssueInProject(ctx, db.GetNextReviewIssueInProjectParams{
			ProjectID: issue.ProjectID,
			ID:        issue.ID,
		})
		if err != nil {
			return
		}
	}
	hasPending, err := h.Queries.HasPendingTaskForIssueAndAgent(ctx, db.HasPendingTaskForIssueAndAgentParams{
		IssueID: next.ID,
		AgentID: squad.LeaderID,
	})
	if err != nil || hasPending {
		return
	}
	if _, err := h.TaskService.EnqueueTaskForSquadLeader(ctx, next, squad.LeaderID, pgtype.UUID{}); err != nil {
		slog.Warn("roadmap: failed to trigger leader continuation",
			"project_id", uuidToString(issue.ProjectID),
			"next_issue_id", uuidToString(next.ID),
			"error", err)
	}
}

// triggerProjectSquadLeaderForReview re-triggers the squad leader when an issue
// moves to in_review. This closes the feedback loop that was missing: agents
// finish work → issue goes in_review → leader reviews and drives the next step.
//
// Two paths:
//   - Issue is squad-assigned → leader can review it directly.
//   - Issue is agent-assigned in a running project → find the project's squad
//     and trigger its leader so it can review and continue the project loop.
func (h *Handler) triggerProjectSquadLeaderForReview(ctx context.Context, issue db.Issue) {
	// Squad-assigned: the squad owns this issue, trigger its leader directly.
	if issue.AssigneeType.String == "squad" && issue.AssigneeID.Valid {
		h.enqueueSquadLeaderTask(ctx, issue, pgtype.UUID{}, "system", "")
		return
	}

	// Agent-assigned in a project: only continue if the project is running.
	if !issue.ProjectID.Valid {
		return
	}
	project, err := h.Queries.GetProject(ctx, issue.ProjectID)
	if err != nil || project.ExecutionStatus != "running" {
		return
	}

	squadID, err := h.Queries.GetFirstProjectSquad(ctx, issue.ProjectID)
	if err != nil {
		return
	}
	squad, err := h.Queries.GetSquad(ctx, squadID)
	if err != nil {
		return
	}

	hasPending, err := h.Queries.HasPendingTaskForIssueAndAgent(ctx, db.HasPendingTaskForIssueAndAgentParams{
		IssueID: issue.ID,
		AgentID: squad.LeaderID,
	})
	if err != nil || hasPending {
		return
	}

	if _, err := h.TaskService.EnqueueTaskForSquadLeader(ctx, issue, squad.LeaderID, pgtype.UUID{}); err != nil {
		slog.Warn("roadmap: failed to trigger project squad leader for review",
			"issue_id", uuidToString(issue.ID),
			"squad_id", uuidToString(squad.ID),
			"error", err)
	}
}
