CREATE TABLE workspace_asset (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID        NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    description     TEXT        NOT NULL DEFAULT '',
    tags            TEXT[]      NOT NULL DEFAULT '{}',
    url             TEXT        NOT NULL,
    content_type    TEXT        NOT NULL,
    size_bytes      BIGINT      NOT NULL DEFAULT 0,
    uploaded_by_type TEXT       NOT NULL DEFAULT 'member',
    uploaded_by_id  UUID        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX workspace_asset_workspace_id ON workspace_asset (workspace_id);
CREATE INDEX workspace_asset_tags ON workspace_asset USING GIN (tags);
