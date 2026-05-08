-- name: CreateWorkspaceAsset :one
INSERT INTO workspace_asset (
    id, workspace_id, name, description, tags,
    url, content_type, size_bytes, uploaded_by_type, uploaded_by_id
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10
)
RETURNING *;

-- name: ListWorkspaceAssets :many
SELECT * FROM workspace_asset
WHERE workspace_id = $1
  AND ($2::text[] IS NULL OR tags && $2::text[])
ORDER BY created_at DESC;

-- name: GetWorkspaceAsset :one
SELECT * FROM workspace_asset
WHERE id = $1 AND workspace_id = $2;

-- name: DeleteWorkspaceAsset :exec
DELETE FROM workspace_asset WHERE id = $1 AND workspace_id = $2;

-- name: UpdateWorkspaceAsset :one
UPDATE workspace_asset
SET name        = COALESCE(sqlc.narg(name), name),
    description = COALESCE(sqlc.narg(description), description),
    tags        = COALESCE(sqlc.narg(tags), tags)
WHERE id = $1 AND workspace_id = $2
RETURNING *;
