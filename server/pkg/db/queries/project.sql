-- name: ListProjects :many
SELECT * FROM project
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
ORDER BY created_at DESC;

-- name: GetProject :one
SELECT * FROM project
WHERE id = $1;

-- name: GetProjectInWorkspace :one
SELECT * FROM project
WHERE id = $1 AND workspace_id = $2;

-- name: CreateProject :one
INSERT INTO project (
    workspace_id, title, description, icon, status,
    lead_type, lead_id, priority, mission
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: UpdateProject :one
UPDATE project SET
    title = COALESCE(sqlc.narg('title'), title),
    description = sqlc.narg('description'),
    icon = sqlc.narg('icon'),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    lead_type = sqlc.narg('lead_type'),
    lead_id = sqlc.narg('lead_id'),
    mission = COALESCE(sqlc.narg('mission'), mission),
    mission_issue_id = COALESCE(sqlc.narg('mission_issue_id'), mission_issue_id),
    execution_status = COALESCE(sqlc.narg('execution_status'), execution_status),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: SetProjectExecutionStatus :one
UPDATE project SET execution_status = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: SetProjectMissionIssue :one
UPDATE project SET mission_issue_id = $2, updated_at = now() WHERE id = $1 RETURNING *;

-- name: DeleteProject :exec
-- Defense-in-depth: workspace_id is a SQL-layer tenant guard. See DeleteIssue.
DELETE FROM project WHERE id = $1 AND workspace_id = $2;

-- name: CountIssuesByProject :one
SELECT count(*) FROM issue
WHERE project_id = $1;

-- name: GetProjectIssueStats :many
SELECT project_id,
       count(*)::bigint AS total_count,
       count(*) FILTER (WHERE status IN ('done', 'cancelled'))::bigint AS done_count
FROM issue
WHERE project_id = ANY(sqlc.arg('project_ids')::uuid[])
GROUP BY project_id;

-- name: AddProjectSquad :one
INSERT INTO project_squad (project_id, squad_id) VALUES ($1, $2) RETURNING *;

-- name: RemoveProjectSquad :execrows
DELETE FROM project_squad WHERE project_id = $1 AND squad_id = $2;

-- name: ListProjectSquads :many
SELECT ps.id, ps.project_id, ps.squad_id, ps.created_at,
       s.name AS squad_name, s.avatar_url, s.leader_id, s.archived_at
FROM project_squad ps
JOIN squad s ON s.id = ps.squad_id
WHERE ps.project_id = $1
ORDER BY ps.created_at ASC;

-- name: ListProjectsForSquad :many
SELECT ps.id, ps.squad_id, ps.project_id, ps.created_at,
       p.title AS project_title, p.icon AS project_icon, p.status AS project_status
FROM project_squad ps
JOIN project p ON p.id = ps.project_id
WHERE ps.squad_id = $1
ORDER BY ps.created_at ASC;

-- name: GetFirstProjectSquad :one
SELECT squad_id FROM project_squad WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1;


-- name: GetFirstIssueInProject :one
SELECT * FROM issue WHERE project_id = $1 ORDER BY created_at ASC LIMIT 1;

-- name: GetNextPendingIssueInProject :one
-- Returns the first issue in a project that still has work to start (backlog or todo),
-- excluding the issue that just triggered the check to avoid re-triggering the same issue.
SELECT * FROM issue
WHERE project_id = $1
  AND id != $2
  AND status IN ('todo', 'backlog')
ORDER BY created_at ASC
LIMIT 1;

-- name: GetNextReviewIssueInProject :one
-- Fallback for triggerProjectLeaderContinuation: when no backlog/todo issues remain,
-- find an in_review issue that the leader may not have actioned yet.
SELECT * FROM issue
WHERE project_id = $1
  AND id != $2
  AND status = 'in_review'
ORDER BY created_at ASC
LIMIT 1;
