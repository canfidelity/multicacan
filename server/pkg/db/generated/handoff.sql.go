package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
)

const getLastIssueTaskWorkDir = `-- name: GetLastIssueTaskWorkDir :one
SELECT work_dir FROM agent_task_queue
WHERE issue_id = $1
  AND work_dir IS NOT NULL
ORDER BY COALESCE(completed_at, started_at, dispatched_at, created_at) DESC
LIMIT 1
`

func (q *Queries) GetLastIssueTaskWorkDir(ctx context.Context, issueID pgtype.UUID) (pgtype.Text, error) {
	row := q.db.QueryRow(ctx, getLastIssueTaskWorkDir, issueID)
	var workDir pgtype.Text
	err := row.Scan(&workDir)
	return workDir, err
}

const getAgentByNameInWorkspace = `-- name: GetAgentByNameInWorkspace :one
SELECT id, workspace_id, name, avatar_url, runtime_mode, runtime_config, visibility, status, max_concurrent_tasks, owner_id, created_at, updated_at, description, runtime_id, instructions, archived_at, archived_by, custom_env, custom_args, mcp_config, model, thinking_level FROM agent
WHERE workspace_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL
LIMIT 1
`

type GetAgentByNameInWorkspaceParams struct {
	WorkspaceID pgtype.UUID `json:"workspace_id"`
	Name        string      `json:"name"`
}

func (q *Queries) GetAgentByNameInWorkspace(ctx context.Context, arg GetAgentByNameInWorkspaceParams) (Agent, error) {
	row := q.db.QueryRow(ctx, getAgentByNameInWorkspace, arg.WorkspaceID, arg.Name)
	var i Agent
	err := row.Scan(
		&i.ID,
		&i.WorkspaceID,
		&i.Name,
		&i.AvatarUrl,
		&i.RuntimeMode,
		&i.RuntimeConfig,
		&i.Visibility,
		&i.Status,
		&i.MaxConcurrentTasks,
		&i.OwnerID,
		&i.CreatedAt,
		&i.UpdatedAt,
		&i.Description,
		&i.RuntimeID,
		&i.Instructions,
		&i.ArchivedAt,
		&i.ArchivedBy,
		&i.CustomEnv,
		&i.CustomArgs,
		&i.McpConfig,
		&i.Model,
		&i.ThinkingLevel,
	)
	return i, err
}

const createTaskHandoff = `-- name: CreateTaskHandoff :one
INSERT INTO task_handoff (from_task_id, to_agent_id, workspace_id, issue_id, context, depth)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, from_task_id, to_agent_id, workspace_id, issue_id, context, depth, consumed, created_at
`

type CreateTaskHandoffParams struct {
	FromTaskID  pgtype.UUID `json:"from_task_id"`
	ToAgentID   pgtype.UUID `json:"to_agent_id"`
	WorkspaceID pgtype.UUID `json:"workspace_id"`
	IssueID     pgtype.UUID `json:"issue_id"`
	Context     string      `json:"context"`
	Depth       int32       `json:"depth"`
}

func (q *Queries) CreateTaskHandoff(ctx context.Context, arg CreateTaskHandoffParams) (TaskHandoff, error) {
	row := q.db.QueryRow(ctx, createTaskHandoff,
		arg.FromTaskID,
		arg.ToAgentID,
		arg.WorkspaceID,
		arg.IssueID,
		arg.Context,
		arg.Depth,
	)
	var i TaskHandoff
	err := row.Scan(
		&i.ID,
		&i.FromTaskID,
		&i.ToAgentID,
		&i.WorkspaceID,
		&i.IssueID,
		&i.Context,
		&i.Depth,
		&i.Consumed,
		&i.CreatedAt,
	)
	return i, err
}

const consumeTaskHandoff = `-- name: ConsumeTaskHandoff :one
UPDATE task_handoff
SET consumed = TRUE
WHERE from_task_id = $1 AND consumed = FALSE
RETURNING id, from_task_id, to_agent_id, workspace_id, issue_id, context, depth, consumed, created_at
`

func (q *Queries) ConsumeTaskHandoff(ctx context.Context, fromTaskID pgtype.UUID) (TaskHandoff, error) {
	row := q.db.QueryRow(ctx, consumeTaskHandoff, fromTaskID)
	var i TaskHandoff
	err := row.Scan(
		&i.ID,
		&i.FromTaskID,
		&i.ToAgentID,
		&i.WorkspaceID,
		&i.IssueID,
		&i.Context,
		&i.Depth,
		&i.Consumed,
		&i.CreatedAt,
	)
	return i, err
}

const createHandoffTask = `-- name: CreateHandoffTask :one
INSERT INTO agent_task_queue (
    agent_id, runtime_id, issue_id, status, priority,
    handoff_context, handoff_depth
)
VALUES ($1, $2, $3, 'queued', $4, $5, $6)
RETURNING id, agent_id, issue_id, status, priority, dispatched_at, started_at, completed_at, result, error, created_at, context, runtime_id, session_id, work_dir, trigger_comment_id, chat_session_id, autopilot_run_id, attempt, max_attempts, parent_task_id, failure_reason, trigger_summary, force_fresh_session, is_leader_task, handoff_context, handoff_depth
`

type CreateHandoffTaskParams struct {
	AgentID        pgtype.UUID `json:"agent_id"`
	RuntimeID      pgtype.UUID `json:"runtime_id"`
	IssueID        pgtype.UUID `json:"issue_id"`
	Priority       int32       `json:"priority"`
	HandoffContext string      `json:"handoff_context"`
	HandoffDepth   int32       `json:"handoff_depth"`
}

func (q *Queries) CreateHandoffTask(ctx context.Context, arg CreateHandoffTaskParams) (AgentTaskQueue, error) {
	row := q.db.QueryRow(ctx, createHandoffTask,
		arg.AgentID,
		arg.RuntimeID,
		arg.IssueID,
		arg.Priority,
		arg.HandoffContext,
		arg.HandoffDepth,
	)
	var i AgentTaskQueue
	err := row.Scan(
		&i.ID,
		&i.AgentID,
		&i.IssueID,
		&i.Status,
		&i.Priority,
		&i.DispatchedAt,
		&i.StartedAt,
		&i.CompletedAt,
		&i.Result,
		&i.Error,
		&i.CreatedAt,
		&i.Context,
		&i.RuntimeID,
		&i.SessionID,
		&i.WorkDir,
		&i.TriggerCommentID,
		&i.ChatSessionID,
		&i.AutopilotRunID,
		&i.Attempt,
		&i.MaxAttempts,
		&i.ParentTaskID,
		&i.FailureReason,
		&i.TriggerSummary,
		&i.ForceFreshSession,
		&i.IsLeaderTask,
		&i.HandoffContext,
		&i.HandoffDepth,
	)
	return i, err
}
