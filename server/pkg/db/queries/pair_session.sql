-- name: CreatePairSession :one
INSERT INTO pair_session (workspace_id, issue_id, agent_id, started_by, runtime_id, work_dir, intervene)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetPairSession :one
SELECT * FROM pair_session WHERE id = $1;

-- name: GetActivePairSessionForIssue :one
SELECT * FROM pair_session
WHERE issue_id = $1 AND status = 'active'
ORDER BY created_at DESC
LIMIT 1;

-- name: ListActivePairSessionsByRuntime :many
SELECT ps.*,
       COALESCE(t.work_dir, '') AS task_work_dir
FROM pair_session ps
LEFT JOIN LATERAL (
    SELECT work_dir FROM agent_task_queue
    WHERE issue_id = ps.issue_id AND work_dir IS NOT NULL AND work_dir != ''
    ORDER BY COALESCE(completed_at, started_at, dispatched_at, created_at) DESC
    LIMIT 1
) t ON true
WHERE ps.status = 'active'
ORDER BY ps.created_at ASC;

-- name: ClaimPairSession :one
UPDATE pair_session
SET work_dir = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdatePairSessionDiffHash :one
UPDATE pair_session
SET last_diff_hash = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: EndPairSession :one
UPDATE pair_session
SET status = 'ended', ended_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- name: EndPairSessionByIssue :many
UPDATE pair_session
SET status = 'ended', ended_at = now(), updated_at = now()
WHERE issue_id = $1 AND status = 'active'
RETURNING *;

-- name: ListPairSessionsByIssue :many
SELECT * FROM pair_session
WHERE issue_id = $1
ORDER BY created_at DESC
LIMIT 20;

-- name: CreatePairSuggestion :one
INSERT INTO pair_suggestion (pair_session_id, diff_snippet, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListPairSuggestions :many
SELECT * FROM pair_suggestion
WHERE pair_session_id = $1
ORDER BY created_at ASC;

-- name: CreatePairIntervention :one
INSERT INTO pair_intervention (session_id, issue_id, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ConsumeIssueInterventions :many
-- Returns all unconsumed interventions for an issue and marks them consumed.
UPDATE pair_intervention
SET consumed = TRUE
WHERE issue_id = $1 AND consumed = FALSE
RETURNING *;