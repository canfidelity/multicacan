ALTER TABLE project ADD COLUMN mission TEXT;
ALTER TABLE project ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (execution_status IN ('idle', 'running', 'paused', 'stopped', 'completed'));
ALTER TABLE project ADD COLUMN mission_issue_id UUID REFERENCES issue(id) ON DELETE SET NULL;

CREATE TABLE project_milestone (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    issue_id UUID REFERENCES issue(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_milestone_project ON project_milestone(project_id);
CREATE INDEX idx_project_milestone_issue ON project_milestone(issue_id) WHERE issue_id IS NOT NULL;
