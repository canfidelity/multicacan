DROP TABLE IF EXISTS project_milestone;
ALTER TABLE project DROP COLUMN IF EXISTS mission_issue_id;
ALTER TABLE project DROP COLUMN IF EXISTS execution_status;
ALTER TABLE project DROP COLUMN IF EXISTS mission;
