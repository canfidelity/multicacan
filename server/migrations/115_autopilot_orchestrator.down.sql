DROP INDEX IF EXISTS idx_autopilot_orchestrator;
ALTER TABLE autopilot DROP COLUMN IF EXISTS orchestrator_context_template;
ALTER TABLE autopilot DROP COLUMN IF EXISTS is_orchestrator;
