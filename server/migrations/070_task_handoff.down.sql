DROP TABLE IF EXISTS task_handoff;
ALTER TABLE agent_task_queue
    DROP COLUMN IF EXISTS handoff_context,
    DROP COLUMN IF EXISTS handoff_depth;
