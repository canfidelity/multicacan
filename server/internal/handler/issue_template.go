package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

type IssueTemplateResponse struct {
	ID              string  `json:"id"`
	WorkspaceID     string  `json:"workspace_id"`
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	DefaultStatus   *string `json:"default_status"`
	DefaultPriority *string `json:"default_priority"`
	CreatedBy       string  `json:"created_by"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func issueTemplateToResponse(t db.IssueTemplate) IssueTemplateResponse {
	return IssueTemplateResponse{
		ID:              uuidToString(t.ID),
		WorkspaceID:     uuidToString(t.WorkspaceID),
		Name:            t.Name,
		Description:     t.Description,
		DefaultStatus:   textToPtr(t.DefaultStatus),
		DefaultPriority: textToPtr(t.DefaultPriority),
		CreatedBy:       uuidToString(t.CreatedBy),
		CreatedAt:       timestampToString(t.CreatedAt),
		UpdatedAt:       timestampToString(t.UpdatedAt),
	}
}

func (h *Handler) ListIssueTemplates(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	templates, err := h.Queries.ListIssueTemplates(r.Context(), wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue templates")
		return
	}

	resp := make([]IssueTemplateResponse, 0, len(templates))
	for _, t := range templates {
		resp = append(resp, issueTemplateToResponse(t))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CreateIssueTemplate(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin", "member"); !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user_id")
	if !ok {
		return
	}

	var req struct {
		Name            string  `json:"name"`
		Description     string  `json:"description"`
		DefaultStatus   *string `json:"default_status"`
		DefaultPriority *string `json:"default_priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	tmpl, err := h.Queries.CreateIssueTemplate(r.Context(), db.CreateIssueTemplateParams{
		WorkspaceID:     wsUUID,
		Name:            req.Name,
		Description:     req.Description,
		DefaultStatus:   ptrToText(req.DefaultStatus),
		DefaultPriority: ptrToText(req.DefaultPriority),
		CreatedBy:       userUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create issue template")
		return
	}
	writeJSON(w, http.StatusCreated, issueTemplateToResponse(tmpl))
}

func (h *Handler) GetIssueTemplate(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	templateID := chi.URLParam(r, "id")
	templateUUID, ok := parseUUIDOrBadRequest(w, templateID, "id")
	if !ok {
		return
	}

	tmpl, err := h.Queries.GetIssueTemplate(r.Context(), db.GetIssueTemplateParams{
		ID:          templateUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "issue template not found")
		return
	}
	writeJSON(w, http.StatusOK, issueTemplateToResponse(tmpl))
}

func (h *Handler) UpdateIssueTemplate(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin", "member"); !ok {
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	templateID := chi.URLParam(r, "id")
	templateUUID, ok := parseUUIDOrBadRequest(w, templateID, "id")
	if !ok {
		return
	}

	var req struct {
		Name            *string `json:"name"`
		Description     *string `json:"description"`
		DefaultStatus   *string `json:"default_status"`
		DefaultPriority *string `json:"default_priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateIssueTemplateParams{
		ID:          templateUUID,
		WorkspaceID: wsUUID,
	}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.DefaultStatus != nil {
		params.DefaultStatus = pgtype.Text{String: *req.DefaultStatus, Valid: true}
	}
	if req.DefaultPriority != nil {
		params.DefaultPriority = pgtype.Text{String: *req.DefaultPriority, Valid: true}
	}

	tmpl, err := h.Queries.UpdateIssueTemplate(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update issue template")
		return
	}
	writeJSON(w, http.StatusOK, issueTemplateToResponse(tmpl))
}

func (h *Handler) DeleteIssueTemplate(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin", "member"); !ok {
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	templateID := chi.URLParam(r, "id")
	templateUUID, ok := parseUUIDOrBadRequest(w, templateID, "id")
	if !ok {
		return
	}

	if _, err := h.Queries.ArchiveIssueTemplate(r.Context(), db.ArchiveIssueTemplateParams{
		ID:          templateUUID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "issue template not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
