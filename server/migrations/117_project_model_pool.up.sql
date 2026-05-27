ALTER TABLE project ADD COLUMN model_pool JSONB NOT NULL DEFAULT '[]';
ALTER TABLE issue ADD COLUMN preferred_model TEXT;
ALTER TABLE agent_task_queue ADD COLUMN preferred_model TEXT;
