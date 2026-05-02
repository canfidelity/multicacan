-- Live Pair Programming sessions.
-- A pair session links an issue to an agent and tracks the daemon's
-- active file-watching loop. The daemon polls active sessions whose
-- runtime_id matches one of its registered runtimes, runs `git diff`
-- on the work_dir, and posts suggestions back via the daemon API.

CREATE TABLE pair_session (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    issue_id      UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    agent_id      UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    started_by    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    runtime_id    UUID REFERENCES agent_runtime(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    work_dir      TEXT,          -- populated by daemon once it claims the session
    last_diff_hash TEXT,         -- SHA-256 of the last diff sent to the agent
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ
);

CREATE INDEX idx_pair_session_workspace ON pair_session (workspace_id, status);
CREATE INDEX idx_pair_session_issue     ON pair_session (issue_id, status);
CREATE INDEX idx_pair_session_runtime   ON pair_session (runtime_id, status);

-- Suggestions streamed back by the agent during a pair session.
CREATE TABLE pair_suggestion (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pair_session_id UUID NOT NULL REFERENCES pair_session(id) ON DELETE CASCADE,
    diff_snippet    TEXT NOT NULL,   -- the git diff that triggered this suggestion
    content         TEXT NOT NULL,   -- agent's response text
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pair_suggestion_session ON pair_suggestion (pair_session_id, created_at);