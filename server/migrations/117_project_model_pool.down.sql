ALTER TABLE agent_task_queue DROP COLUMN IF EXISTS preferred_model;
ALTER TABLE issue DROP COLUMN IF EXISTS preferred_model;
ALTER TABLE project DROP COLUMN IF EXISTS model_pool;
