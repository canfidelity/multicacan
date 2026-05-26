package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/canfidelity/multicacan/server/pkg/db/generated"
)

type OutboundWebhookResponse struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspace_id"`
	URL         string   `json:"url"`
	Events      []string `json:"events"`
	IsActive    bool     `json:"is_active"`
	CreatedBy   string   `json:"created_by"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

type OutboundWebhookDeliveryResponse struct {
	ID          string  `json:"id"`
	WebhookID   string  `json:"webhook_id"`
	Event       string  `json:"event"`
	Status      string  `json:"status"`
	StatusCode  *int32  `json:"status_code"`
	Error       *string `json:"error"`
	Attempt     int32   `json:"attempt"`
	CreatedAt   string  `json:"created_at"`
	DeliveredAt *string `json:"delivered_at"`
}

func outboundWebhookToResponse(w db.OutboundWebhook) OutboundWebhookResponse {
	events := w.Events
	if events == nil {
		events = []string{}
	}
	return OutboundWebhookResponse{
		ID:          uuidToString(w.ID),
		WorkspaceID: uuidToString(w.WorkspaceID),
		URL:         w.Url,
		Events:      events,
		IsActive:    w.IsActive,
		CreatedBy:   uuidToString(w.CreatedBy),
		CreatedAt:   timestampToString(w.CreatedAt),
		UpdatedAt:   timestampToString(w.UpdatedAt),
	}
}

func outboundWebhookDeliveryToResponse(d db.OutboundWebhookDelivery) OutboundWebhookDeliveryResponse {
	var statusCode *int32
	if d.StatusCode.Valid {
		statusCode = &d.StatusCode.Int32
	}
	return OutboundWebhookDeliveryResponse{
		ID:          uuidToString(d.ID),
		WebhookID:   uuidToString(d.WebhookID),
		Event:       d.Event,
		Status:      d.Status,
		StatusCode:  statusCode,
		Error:       textToPtr(d.Error),
		Attempt:     d.Attempt,
		CreatedAt:   timestampToString(d.CreatedAt),
		DeliveredAt: timestampToPtr(d.DeliveredAt),
	}
}

func (h *Handler) ListOutboundWebhooks(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	hooks, err := h.Queries.ListOutboundWebhooks(r.Context(), wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list webhooks")
		return
	}

	resp := make([]OutboundWebhookResponse, 0, len(hooks))
	for _, hook := range hooks {
		resp = append(resp, outboundWebhookToResponse(hook))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CreateOutboundWebhook(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin"); !ok {
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
		URL    string   `json:"url"`
		Events []string `json:"events"`
		Secret *string  `json:"secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if len(req.Events) == 0 {
		writeError(w, http.StatusBadRequest, "at least one event is required")
		return
	}

	hook, err := h.Queries.CreateOutboundWebhook(r.Context(), db.CreateOutboundWebhookParams{
		WorkspaceID: wsUUID,
		Url:         req.URL,
		Events:      req.Events,
		Secret:      ptrToText(req.Secret),
		CreatedBy:   userUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create webhook")
		return
	}
	writeJSON(w, http.StatusCreated, outboundWebhookToResponse(hook))
}

func (h *Handler) UpdateOutboundWebhook(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin"); !ok {
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	hookID := chi.URLParam(r, "id")
	hookUUID, ok := parseUUIDOrBadRequest(w, hookID, "id")
	if !ok {
		return
	}

	var req struct {
		URL      *string  `json:"url"`
		Events   []string `json:"events"`
		Secret   *string  `json:"secret"`
		IsActive *bool    `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateOutboundWebhookParams{
		ID:          hookUUID,
		WorkspaceID: wsUUID,
	}
	if req.URL != nil {
		params.Url = pgtype.Text{String: *req.URL, Valid: true}
	}
	if req.Events != nil {
		params.Events = req.Events
	}
	if req.Secret != nil {
		params.Secret = pgtype.Text{String: *req.Secret, Valid: true}
	}
	if req.IsActive != nil {
		params.IsActive = pgtype.Bool{Bool: *req.IsActive, Valid: true}
	}

	hook, err := h.Queries.UpdateOutboundWebhook(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update webhook")
		return
	}
	writeJSON(w, http.StatusOK, outboundWebhookToResponse(hook))
}

func (h *Handler) DeleteOutboundWebhook(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	if _, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin"); !ok {
		return
	}

	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	hookID := chi.URLParam(r, "id")
	hookUUID, ok := parseUUIDOrBadRequest(w, hookID, "id")
	if !ok {
		return
	}

	if err := h.Queries.DeleteOutboundWebhook(r.Context(), db.DeleteOutboundWebhookParams{
		ID:          hookUUID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "webhook not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListOutboundWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "workspaceId")
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	hookID := chi.URLParam(r, "id")
	hookUUID, ok := parseUUIDOrBadRequest(w, hookID, "id")
	if !ok {
		return
	}

	// Verify the webhook belongs to this workspace.
	if _, err := h.Queries.GetOutboundWebhook(r.Context(), db.GetOutboundWebhookParams{
		ID:          hookUUID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "webhook not found")
		return
	}

	limit := int32(20)
	offset := int32(0)
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = int32(v)
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = int32(v)
		}
	}

	deliveries, err := h.Queries.ListOutboundWebhookDeliveries(r.Context(), db.ListOutboundWebhookDeliveriesParams{
		WebhookID: hookUUID,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list deliveries")
		return
	}

	resp := make([]OutboundWebhookDeliveryResponse, 0, len(deliveries))
	for _, d := range deliveries {
		resp = append(resp, outboundWebhookDeliveryToResponse(d))
	}
	writeJSON(w, http.StatusOK, resp)
}
