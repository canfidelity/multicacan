-- name: CreateOutboundWebhook :one
INSERT INTO outbound_webhook (workspace_id, url, events, secret, created_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetOutboundWebhook :one
SELECT * FROM outbound_webhook WHERE id = $1 AND workspace_id = $2;

-- name: ListOutboundWebhooks :many
SELECT * FROM outbound_webhook WHERE workspace_id = $1 ORDER BY created_at ASC;

-- name: ListActiveOutboundWebhooksForEvent :many
-- Returns active webhooks subscribed to the given event (exact match or wildcard "*").
SELECT * FROM outbound_webhook
WHERE workspace_id = $1
  AND is_active = TRUE
  AND (events @> ARRAY[$2::text] OR events @> ARRAY['*'::text]);

-- name: UpdateOutboundWebhook :one
UPDATE outbound_webhook SET
    url       = COALESCE(sqlc.narg('url'), url),
    events    = COALESCE(sqlc.narg('events'), events),
    secret    = COALESCE(sqlc.narg('secret'), secret),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    updated_at = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteOutboundWebhook :exec
DELETE FROM outbound_webhook WHERE id = $1 AND workspace_id = $2;

-- name: CreateOutboundWebhookDelivery :one
INSERT INTO outbound_webhook_delivery (webhook_id, event, payload, status)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateOutboundWebhookDelivery :exec
UPDATE outbound_webhook_delivery SET
    status       = $2,
    status_code  = $3,
    error        = $4,
    attempt      = attempt + 1,
    delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END
WHERE id = $1;

-- name: ListOutboundWebhookDeliveries :many
SELECT * FROM outbound_webhook_delivery
WHERE webhook_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
