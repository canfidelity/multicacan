-- name: UpsertAgentMemory :one
INSERT INTO agent_memory (workspace_id, agent_id, key, value, description, issue_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (agent_id, key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      issue_id = EXCLUDED.issue_id,
      updated_at = now()
RETURNING *;

-- name: GetAgentMemory :one
SELECT * FROM agent_memory WHERE agent_id = $1 AND key = $2;

-- name: ListAgentMemories :many
SELECT * FROM agent_memory WHERE agent_id = $1 ORDER BY updated_at DESC;

-- name: DeleteAgentMemory :execrows
DELETE FROM agent_memory WHERE agent_id = $1 AND key = $2;

-- name: ListAgentMemoriesInWorkspace :many
SELECT * FROM agent_memory
WHERE workspace_id = $1 AND agent_id = $2
ORDER BY updated_at DESC
LIMIT $3;
