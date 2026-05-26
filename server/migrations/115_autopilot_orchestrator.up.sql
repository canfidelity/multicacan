ALTER TABLE autopilot ADD COLUMN is_orchestrator BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE autopilot ADD COLUMN orchestrator_context_template TEXT;
CREATE UNIQUE INDEX idx_autopilot_orchestrator ON autopilot(workspace_id) WHERE is_orchestrator = TRUE;
