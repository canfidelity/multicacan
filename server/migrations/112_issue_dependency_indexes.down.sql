DROP INDEX IF EXISTS idx_issue_dependency_issue;
DROP INDEX IF EXISTS idx_issue_dependency_depends_on;
ALTER TABLE issue_dependency DROP COLUMN IF EXISTS created_at;
ALTER TABLE issue_dependency DROP COLUMN IF EXISTS created_by;
ALTER TABLE issue_dependency DROP COLUMN IF EXISTS workspace_id;
