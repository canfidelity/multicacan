-- issue_dependency already exists from 001_init; add indexes and workspace scoping
ALTER TABLE issue_dependency ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspace(id) ON DELETE CASCADE;
ALTER TABLE issue_dependency ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE issue_dependency ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_issue_dependency_issue ON issue_dependency(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_dependency_depends_on ON issue_dependency(depends_on_issue_id);
