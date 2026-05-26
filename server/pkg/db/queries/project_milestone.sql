-- name: CreateProjectMilestone :one
INSERT INTO project_milestone (project_id, workspace_id, title, description, position, issue_id)
SELECT $1, p.workspace_id, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM project_milestone WHERE project_id = $1), 0), $4
FROM project p WHERE p.id = $1
RETURNING *;

-- name: ListProjectMilestones :many
SELECT * FROM project_milestone WHERE project_id = $1 ORDER BY position ASC, created_at ASC;

-- name: GetProjectMilestone :one
SELECT * FROM project_milestone WHERE id = $1;

-- name: GetProjectMilestoneByIssue :one
SELECT * FROM project_milestone WHERE issue_id = $1 LIMIT 1;

-- name: UpdateProjectMilestone :one
UPDATE project_milestone SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    issue_id = COALESCE(sqlc.narg('issue_id'), issue_id),
    position = COALESCE(sqlc.narg('position'), position),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteProjectMilestone :execrows
DELETE FROM project_milestone WHERE id = $1 AND project_id = $2;

-- name: CountPendingMilestones :one
SELECT count(*) FROM project_milestone
WHERE project_id = $1 AND status != 'done';

-- name: ListPendingMilestones :many
SELECT * FROM project_milestone
WHERE project_id = $1 AND status = 'todo'
ORDER BY position ASC, created_at ASC;
