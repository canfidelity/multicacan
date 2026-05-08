-- Adds handoff support to the task queue:
--   handoff_context  — text injected into the next agent's prompt
--   handoff_depth    — chain length guard (max 10, enforced at service layer)
ALTER TABLE agent_task_queue
    ADD COLUMN handoff_context TEXT NOT NULL DEFAULT '',
    ADD COLUMN handoff_depth   INT  NOT NULL DEFAULT 0;

-- Audit table: one row per agent-to-agent handoff.
-- Consumed when CompleteTask fires and processes the pending handoff.
CREATE TABLE task_handoff (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    from_task_id    UUID        NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
    to_agent_id     UUID        NOT NULL,
    workspace_id    UUID        NOT NULL,
    issue_id        UUID,
    context         TEXT        NOT NULL DEFAULT '',
    depth           INT         NOT NULL DEFAULT 0,
    consumed        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX task_handoff_from_task_unconsumed ON task_handoff (from_task_id) WHERE consumed = FALSE;
