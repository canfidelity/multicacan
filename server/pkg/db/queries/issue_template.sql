-- name: CreateIssueTemplate :one
INSERT INTO issue_template (workspace_id, name, description, default_status, default_priority, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetIssueTemplate :one
SELECT * FROM issue_template WHERE id = $1 AND workspace_id = $2;

-- name: ListIssueTemplates :many
SELECT * FROM issue_template
WHERE workspace_id = $1 AND archived_at IS NULL
ORDER BY created_at ASC;

-- name: UpdateIssueTemplate :one
UPDATE issue_template SET
    name             = COALESCE(sqlc.narg('name'), name),
    description      = COALESCE(sqlc.narg('description'), description),
    default_status   = COALESCE(sqlc.narg('default_status'), default_status),
    default_priority = COALESCE(sqlc.narg('default_priority'), default_priority),
    updated_at       = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: ArchiveIssueTemplate :one
UPDATE issue_template SET archived_at = NOW(), updated_at = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;
