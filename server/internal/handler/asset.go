package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

type WorkspaceAssetResponse struct {
	ID             string   `json:"id"`
	WorkspaceID    string   `json:"workspace_id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Tags           []string `json:"tags"`
	URL            string   `json:"url"`
	DownloadURL    string   `json:"download_url"`
	ContentType    string   `json:"content_type"`
	SizeBytes      int64    `json:"size_bytes"`
	UploadedByType string   `json:"uploaded_by_type"`
	UploadedByID   string   `json:"uploaded_by_id"`
	CreatedAt      string   `json:"created_at"`
}

func (h *Handler) assetToResponse(a db.WorkspaceAsset) WorkspaceAssetResponse {
	resp := WorkspaceAssetResponse{
		ID:             uuidToString(a.ID),
		WorkspaceID:    uuidToString(a.WorkspaceID),
		Name:           a.Name,
		Description:    a.Description,
		Tags:           a.Tags,
		URL:            a.Url,
		DownloadURL:    a.Url,
		ContentType:    a.ContentType,
		SizeBytes:      a.SizeBytes,
		UploadedByType: a.UploadedByType,
		UploadedByID:   uuidToString(a.UploadedByID),
		CreatedAt:      a.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	}
	if h.CFSigner != nil {
		resp.DownloadURL = h.CFSigner.SignedURL(a.Url, time.Now().Add(30*time.Minute))
	}
	if resp.Tags == nil {
		resp.Tags = []string{}
	}
	return resp
}

// ---------------------------------------------------------------------------
// UploadAsset — POST /api/assets
// ---------------------------------------------------------------------------

func (h *Handler) UploadAsset(w http.ResponseWriter, r *http.Request) {
	if h.Storage == nil {
		writeError(w, http.StatusServiceUnavailable, "file upload not configured")
		return
	}

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}

	if _, err := h.getWorkspaceMember(r.Context(), userID, workspaceID); err != nil {
		writeError(w, http.StatusForbidden, "not a member of this workspace")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "file too large or invalid multipart form")
		return
	}
	defer r.MultipartForm.RemoveAll()

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	if ct, ok := extContentTypes[strings.ToLower(path.Ext(header.Filename))]; ok {
		contentType = ct
	}
	if _, err := file.Seek(0, 0); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	data := make([]byte, 0, header.Size)
	tmp := make([]byte, 32*1024)
	for {
		nr, rerr := file.Read(tmp)
		if nr > 0 {
			data = append(data, tmp[:nr]...)
		}
		if rerr != nil {
			break
		}
	}

	id, err := uuid.NewV7()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	filename := id.String() + path.Ext(header.Filename)
	key := "workspaces/" + workspaceID + "/assets/" + filename

	link, err := h.Storage.Upload(r.Context(), key, data, contentType, header.Filename)
	if err != nil {
		slog.Error("asset upload failed", "error", err)
		writeError(w, http.StatusInternalServerError, "upload failed")
		return
	}

	name := r.FormValue("name")
	if name == "" {
		name = header.Filename
	}
	description := r.FormValue("description")

	var tags []string
	if tv := r.FormValue("tags"); tv != "" {
		for _, t := range strings.Split(tv, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}
	if tags == nil {
		tags = []string{}
	}

	uploaderType, uploaderID := h.resolveActor(r, userID, workspaceID)

	asset, err := h.Queries.CreateWorkspaceAsset(r.Context(), db.CreateWorkspaceAssetParams{
		ID:             pgtype.UUID{Bytes: id, Valid: true},
		WorkspaceID:    parseUUID(workspaceID),
		Name:           name,
		Description:    description,
		Tags:           tags,
		Url:            link,
		ContentType:    contentType,
		SizeBytes:      int64(len(data)),
		UploadedByType: uploaderType,
		UploadedByID:   parseUUID(uploaderID),
	})
	if err != nil {
		slog.Error("failed to create asset record", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to save asset")
		return
	}

	writeJSON(w, http.StatusCreated, h.assetToResponse(asset))
}

// ---------------------------------------------------------------------------
// ListAssets — GET /api/assets
// ---------------------------------------------------------------------------

func (h *Handler) ListAssets(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}

	var tags []string
	if tv := r.URL.Query().Get("tag"); tv != "" {
		for _, t := range strings.Split(tv, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tags = append(tags, t)
			}
		}
	}

	assets, err := h.Queries.ListWorkspaceAssets(r.Context(), db.ListWorkspaceAssetsParams{
		WorkspaceID: parseUUID(workspaceID),
		Column2:     tags,
	})
	if err != nil {
		slog.Error("failed to list assets", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list assets")
		return
	}

	resp := make([]WorkspaceAssetResponse, len(assets))
	for i, a := range assets {
		resp[i] = h.assetToResponse(a)
	}
	writeJSON(w, http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// GetAsset — GET /api/assets/{id}
// ---------------------------------------------------------------------------

func (h *Handler) GetAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}

	assetID := chi.URLParam(r, "id")
	assetUUID, ok := parseUUIDOrBadRequest(w, assetID, "asset id")
	if !ok {
		return
	}

	asset, err := h.Queries.GetWorkspaceAsset(r.Context(), db.GetWorkspaceAssetParams{
		ID:          assetUUID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	}

	writeJSON(w, http.StatusOK, h.assetToResponse(asset))
}

// ---------------------------------------------------------------------------
// UpdateAsset — PATCH /api/assets/{id}
// ---------------------------------------------------------------------------

func (h *Handler) UpdateAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}

	assetID := chi.URLParam(r, "id")
	assetUUID, ok := parseUUIDOrBadRequest(w, assetID, "asset id")
	if !ok {
		return
	}

	var req struct {
		Name        *string  `json:"name"`
		Description *string  `json:"description"`
		Tags        []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateWorkspaceAssetParams{
		ID:          assetUUID,
		WorkspaceID: parseUUID(workspaceID),
	}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.Tags != nil {
		params.Tags = req.Tags
	}

	asset, err := h.Queries.UpdateWorkspaceAsset(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	}

	writeJSON(w, http.StatusOK, h.assetToResponse(asset))
}

// ---------------------------------------------------------------------------
// DeleteAsset — DELETE /api/assets/{id}
// ---------------------------------------------------------------------------

func (h *Handler) DeleteAsset(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}

	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	assetID := chi.URLParam(r, "id")
	assetUUID, ok := parseUUIDOrBadRequest(w, assetID, "asset id")
	if !ok {
		return
	}

	asset, err := h.Queries.GetWorkspaceAsset(r.Context(), db.GetWorkspaceAssetParams{
		ID:          assetUUID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	}

	uploaderID := uuidToString(asset.UploadedByID)
	isUploader := asset.UploadedByType == "member" && uploaderID == userID
	member, hasMember := ctxMember(r.Context())
	isAdmin := hasMember && (member.Role == "admin" || member.Role == "owner")

	if !isUploader && !isAdmin {
		writeError(w, http.StatusForbidden, "not authorized to delete this asset")
		return
	}

	if err := h.Queries.DeleteWorkspaceAsset(r.Context(), db.DeleteWorkspaceAssetParams{
		ID:          asset.ID,
		WorkspaceID: asset.WorkspaceID,
	}); err != nil {
		slog.Error("failed to delete asset", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete asset")
		return
	}

	h.deleteS3Object(r.Context(), asset.Url)
	w.WriteHeader(http.StatusNoContent)
}
