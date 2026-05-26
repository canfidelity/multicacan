package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

type IssueDependencyResponse struct {
	ID               string `json:"id"`
	IssueID          string `json:"issue_id"`
	DependsOnIssueID string `json:"depends_on_issue_id"`
	Type             string `json:"type"`
	DepNumber        int64  `json:"dep_number"`
	DepTitle         string `json:"dep_title"`
	DepStatus        string `json:"dep_status"`
	CreatedAt        string `json:"created_at"`
}

func issueDependenciesRowToResponse(row db.ListIssueDependenciesRow) IssueDependencyResponse {
	return IssueDependencyResponse{
		ID:               uuidToString(row.ID),
		IssueID:          uuidToString(row.IssueID),
		DependsOnIssueID: uuidToString(row.DependsOnIssueID),
		Type:             row.Type,
		DepNumber:        row.DepNumber,
		DepTitle:         row.DepTitle,
		DepStatus:        row.DepStatus,
		CreatedAt:        timestampToString(row.CreatedAt),
	}
}

func issueDependentsRowToResponse(row db.ListIssueDependentsRow) IssueDependencyResponse {
	return IssueDependencyResponse{
		ID:               uuidToString(row.ID),
		IssueID:          uuidToString(row.IssueID),
		DependsOnIssueID: uuidToString(row.DependsOnIssueID),
		Type:             row.Type,
		DepNumber:        row.DepNumber,
		DepTitle:         row.DepTitle,
		DepStatus:        row.DepStatus,
		CreatedAt:        timestampToString(row.CreatedAt),
	}
}

func (h *Handler) ListIssueDependencies(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "id")
	issue, ok := h.loadIssueForUser(w, r, issueID)
	if !ok {
		return
	}

	deps, err := h.Queries.ListIssueDependencies(r.Context(), issue.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue dependencies")
		return
	}

	dependents, err := h.Queries.ListIssueDependents(r.Context(), issue.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue dependents")
		return
	}

	depsResp := make([]IssueDependencyResponse, 0, len(deps))
	for _, d := range deps {
		depsResp = append(depsResp, issueDependenciesRowToResponse(d))
	}

	dependentsResp := make([]IssueDependencyResponse, 0, len(dependents))
	for _, d := range dependents {
		dependentsResp = append(dependentsResp, issueDependentsRowToResponse(d))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"dependencies": depsResp,
		"dependents":   dependentsResp,
	})
}

func (h *Handler) AddIssueDependency(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	issueID := chi.URLParam(r, "id")
	issue, ok := h.loadIssueForUser(w, r, issueID)
	if !ok {
		return
	}

	var req struct {
		DependsOnIssueID string `json:"depends_on_issue_id"`
		Type             string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	switch req.Type {
	case "blocks", "blocked_by", "related":
	default:
		writeError(w, http.StatusBadRequest, "type must be one of: blocks, blocked_by, related")
		return
	}

	if req.DependsOnIssueID == "" {
		writeError(w, http.StatusBadRequest, "depends_on_issue_id is required")
		return
	}

	dependsOnUUID, ok := parseUUIDOrBadRequest(w, req.DependsOnIssueID, "depends_on_issue_id")
	if !ok {
		return
	}

	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user_id")
	if !ok {
		return
	}

	dep, err := h.Queries.AddIssueDependency(r.Context(), db.AddIssueDependencyParams{
		WorkspaceID:      issue.WorkspaceID,
		IssueID:          issue.ID,
		DependsOnIssueID: dependsOnUUID,
		Type:             req.Type,
		CreatedBy:        userUUID,
	})
	if err != nil {
		if isNotFound(err) {
			// ON CONFLICT DO NOTHING returns no rows — treat as conflict.
			writeError(w, http.StatusConflict, "dependency already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to add issue dependency")
		return
	}

	writeJSON(w, http.StatusCreated, IssueDependencyResponse{
		ID:               uuidToString(dep.ID),
		IssueID:          uuidToString(dep.IssueID),
		DependsOnIssueID: uuidToString(dep.DependsOnIssueID),
		Type:             dep.Type,
		CreatedAt:        timestampToString(dep.CreatedAt),
	})
}

func (h *Handler) RemoveIssueDependency(w http.ResponseWriter, r *http.Request) {
	depID := chi.URLParam(r, "depId")
	depUUID, ok := parseUUIDOrBadRequest(w, depID, "depId")
	if !ok {
		return
	}

	// Verify the caller has access to the parent issue before removing.
	issueID := chi.URLParam(r, "id")
	if _, ok := h.loadIssueForUser(w, r, issueID); !ok {
		return
	}

	n, err := h.Queries.RemoveIssueDependencyByID(r.Context(), depUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove issue dependency")
		return
	}
	if n == 0 {
		writeError(w, http.StatusNotFound, "dependency not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
