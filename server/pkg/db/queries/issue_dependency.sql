-- name: AddIssueDependency :one
INSERT INTO issue_dependency (workspace_id, issue_id, depends_on_issue_id, type, created_by)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (issue_id, depends_on_issue_id, type) DO NOTHING
RETURNING *;

-- name: RemoveIssueDependencyByID :execrows
DELETE FROM issue_dependency WHERE id = $1;

-- name: ListIssueDependencies :many
SELECT d.id, d.issue_id, d.depends_on_issue_id, d.type, d.created_at,
       i.number::bigint AS dep_number, i.title AS dep_title, i.status AS dep_status
FROM issue_dependency d
JOIN issue i ON i.id = d.depends_on_issue_id
WHERE d.issue_id = $1
ORDER BY d.created_at ASC;

-- name: ListIssueDependents :many
SELECT d.id, d.issue_id, d.depends_on_issue_id, d.type, d.created_at,
       i.number::bigint AS dep_number, i.title AS dep_title, i.status AS dep_status
FROM issue_dependency d
JOIN issue i ON i.id = d.issue_id
WHERE d.depends_on_issue_id = $1
ORDER BY d.created_at ASC;
