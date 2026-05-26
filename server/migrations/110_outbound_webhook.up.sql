CREATE TABLE outbound_webhook (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID        NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    url          TEXT        NOT NULL,
    events       TEXT[]      NOT NULL DEFAULT '{}',
    secret       TEXT,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by   UUID        NOT NULL REFERENCES "user"(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbound_webhook_workspace ON outbound_webhook(workspace_id) WHERE is_active = TRUE;

CREATE TABLE outbound_webhook_delivery (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id   UUID        NOT NULL REFERENCES outbound_webhook(id) ON DELETE CASCADE,
    event        TEXT        NOT NULL,
    payload      JSONB       NOT NULL DEFAULT '{}',
    status       TEXT        NOT NULL DEFAULT 'pending',
    status_code  INT,
    error        TEXT,
    attempt      INT         NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_outbound_webhook_delivery_webhook ON outbound_webhook_delivery(webhook_id, created_at DESC);
