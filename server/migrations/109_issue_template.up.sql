CREATE TABLE issue_template (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID        NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    description  TEXT        NOT NULL DEFAULT '',
    default_status   TEXT,
    default_priority TEXT,
    created_by   UUID        NOT NULL REFERENCES "user"(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at  TIMESTAMPTZ
);

CREATE INDEX idx_issue_template_workspace ON issue_template(workspace_id) WHERE archived_at IS NULL;
