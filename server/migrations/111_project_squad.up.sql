CREATE TABLE project_squad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    squad_id UUID NOT NULL REFERENCES squad(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, squad_id)
);
CREATE INDEX idx_project_squad_project ON project_squad(project_id);
CREATE INDEX idx_project_squad_squad ON project_squad(squad_id);
