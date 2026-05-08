# CLI and Agent Daemon Guide

The `multicacan` CLI connects your local machine to Multicacan. It handles authentication, workspace management, issue tracking, and runs the agent daemon that executes AI tasks locally.

## Installation

### Homebrew (macOS/Linux)

```bash
brew install multicacan
```

### Build from Source

```bash
git clone https://github.com/canfidelity/multicacan.git
cd multicacan
make build
cp server/bin/multicacan /usr/local/bin/multicacan
```

### Update

```bash
brew upgrade multicacan
```

For install script or manual installs, use:

```bash
multicacan update
```

`multicacan update` auto-detects your installation method and upgrades accordingly.

## Quick Start

```bash
# One-command setup: configure, authenticate, and start the daemon
multicacan setup

# For self-hosted (local) deployments:
multicacan setup self-host
```

Or step by step:

```bash
# 1. Authenticate (opens browser for login)
multicacan login

# 2. Start the agent daemon
multicacan daemon start

# 3. Done — agents in your watched workspaces can now execute tasks on your machine
```

`multicacan login` automatically discovers all workspaces you belong to and adds them to the daemon watch list.

## Authentication

### Browser Login

```bash
multicacan login
```

Opens your browser for OAuth authentication, creates a 90-day personal access token, and auto-configures your workspaces.

### Token Login

```bash
multicacan login --token
```

Authenticate by pasting a personal access token directly. Useful for headless environments.

### Check Status

```bash
multicacan auth status
```

Shows your current server, user, and token validity.

### Logout

```bash
multicacan auth logout
```

Removes the stored authentication token.

## Agent Daemon

The daemon is the local agent runtime. It detects available AI CLIs on your machine, registers them with the Multicacan server, and executes tasks when agents are assigned work.

### Start

```bash
multicacan daemon start
```

By default, the daemon runs in the background and logs to `~/.multicacan/daemon.log`.

To run in the foreground (useful for debugging):

```bash
multicacan daemon start --foreground
```

### Stop

```bash
multicacan daemon stop
```

### Status

```bash
multicacan daemon status
multicacan daemon status --output json
```

Shows PID, uptime, detected agents, and watched workspaces.

### Logs

```bash
multicacan daemon logs              # Last 50 lines
multicacan daemon logs -f           # Follow (tail -f)
multicacan daemon logs -n 100       # Last 100 lines
```

### Supported Agents

The daemon auto-detects these AI CLIs on your PATH:

| CLI | Command | Description |
|-----|---------|-------------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | Anthropic's coding agent |
| [Codex](https://github.com/openai/codex) | `codex` | OpenAI's coding agent |
| OpenCode | `opencode` | Open-source coding agent |
| OpenClaw | `openclaw` | Open-source coding agent |
| Hermes | `hermes` | Nous Research coding agent |
| Gemini | `gemini` | Google's coding agent |
| [Pi](https://pi.dev/) | `pi` | Pi coding agent |
| [Cursor Agent](https://cursor.com/) | `cursor-agent` | Cursor's headless coding agent |
| Kimi | `kimi` | Moonshot coding agent |
| Kiro CLI | `kiro-cli` | Kiro ACP coding agent |

You need at least one installed. The daemon registers each detected CLI as an available runtime.

### How It Works

1. On start, the daemon detects installed agent CLIs and registers a runtime for each agent in each watched workspace
2. It polls the server at a configurable interval (default: 3s) for claimed tasks
3. When a task arrives, it creates an isolated workspace directory, spawns the agent CLI, and streams results back
4. Heartbeats are sent periodically (default: 15s) so the server knows the daemon is alive
5. On shutdown, all runtimes are deregistered

### Configuration

Daemon behavior is configured via flags or environment variables:

| Setting | Flag | Env Variable | Default |
|---------|------|--------------|---------|
| Poll interval | `--poll-interval` | `MULTICACAN_DAEMON_POLL_INTERVAL` | `3s` |
| Heartbeat interval | `--heartbeat-interval` | `MULTICACAN_DAEMON_HEARTBEAT_INTERVAL` | `15s` |
| Agent timeout | `--agent-timeout` | `MULTICACAN_AGENT_TIMEOUT` | `2h` |
| Codex semantic inactivity timeout | `--codex-semantic-inactivity-timeout` | `MULTICACAN_CODEX_SEMANTIC_INACTIVITY_TIMEOUT` | `10m` |
| Max concurrent tasks | `--max-concurrent-tasks` | `MULTICACAN_DAEMON_MAX_CONCURRENT_TASKS` | `20` |
| Daemon ID | `--daemon-id` | `MULTICACAN_DAEMON_ID` | hostname |
| Device name | `--device-name` | `MULTICACAN_DAEMON_DEVICE_NAME` | hostname |
| Runtime name | `--runtime-name` | `MULTICACAN_AGENT_RUNTIME_NAME` | `Local Agent` |
| Workspaces root | — | `MULTICACAN_WORKSPACES_ROOT` | `~/multicacan_workspaces` |
| GC enabled | — | `MULTICACAN_GC_ENABLED` | `true` (set `false`/`0` to disable) |
| GC scan interval | — | `MULTICACAN_GC_INTERVAL` | `1h` |
| GC TTL (done/cancelled issues) | — | `MULTICACAN_GC_TTL` | `24h` |
| GC orphan TTL (no `.gc_meta.json`) | — | `MULTICACAN_GC_ORPHAN_TTL` | `72h` |
| GC artifact TTL (open issues) | — | `MULTICACAN_GC_ARTIFACT_TTL` | `12h` (set `0` to disable) |
| GC artifact patterns | — | `MULTICACAN_GC_ARTIFACT_PATTERNS` | `node_modules,.next,.turbo` |

#### Workspace garbage collection

The daemon periodically scans `MULTICACAN_WORKSPACES_ROOT` and reclaims disk space in three modes:

- **Full task cleanup** — when an issue's status is `done` or `cancelled` and has been idle for `MULTICACAN_GC_TTL`, the entire task directory is removed.
- **Orphan cleanup** — task directories with no `.gc_meta.json` (e.g. left over from a daemon crash) are removed once they exceed `MULTICACAN_GC_ORPHAN_TTL`.
- **Artifact-only cleanup** — when a task has been completed for at least `MULTICACAN_GC_ARTIFACT_TTL` but the issue is still open, regenerable build outputs whose directory basename matches `MULTICACAN_GC_ARTIFACT_PATTERNS` are removed; the rest of the workdir (source, `.git`, `output/`, `logs/`, `.gc_meta.json`) is preserved so the agent can resume the same workdir on the next task.

Patterns are basename-only — entries containing `/` or `\` are silently dropped — and `.git` subtrees are never descended into. The default list (`node_modules`, `.next`, `.turbo`) is intentionally narrow; extend it per deployment if your repos consistently produce other regenerable directories (for example, `MULTICACAN_GC_ARTIFACT_PATTERNS=node_modules,.next,.turbo,target,__pycache__`). To disable artifact cleanup entirely, set `MULTICACAN_GC_ARTIFACT_TTL=0`.

Agent-specific overrides:

| Variable | Description |
|----------|-------------|
| `MULTICACAN_CLAUDE_PATH` | Custom path to the `claude` binary |
| `MULTICACAN_CLAUDE_MODEL` | Override the Claude model used |
| `MULTICACAN_CLAUDE_ARGS` | Default extra arguments for Claude Code runs |
| `MULTICACAN_CODEX_PATH` | Custom path to the `codex` binary |
| `MULTICACAN_CODEX_MODEL` | Override the Codex model used |
| `MULTICACAN_CODEX_ARGS` | Default extra arguments for Codex runs |
| `MULTICACAN_OPENCODE_PATH` | Custom path to the `opencode` binary |
| `MULTICACAN_OPENCODE_MODEL` | Override the OpenCode model used |
| `MULTICACAN_OPENCLAW_PATH` | Custom path to the `openclaw` binary |
| `MULTICACAN_OPENCLAW_MODEL` | Override the OpenClaw model used |
| `MULTICACAN_HERMES_PATH` | Custom path to the `hermes` binary |
| `MULTICACAN_HERMES_MODEL` | Override the Hermes model used |
| `MULTICACAN_GEMINI_PATH` | Custom path to the `gemini` binary |
| `MULTICACAN_GEMINI_MODEL` | Override the Gemini model used |
| `MULTICACAN_PI_PATH` | Custom path to the `pi` binary |
| `MULTICACAN_PI_MODEL` | Override the Pi model used |
| `MULTICACAN_CURSOR_PATH` | Custom path to the `cursor-agent` binary |
| `MULTICACAN_CURSOR_MODEL` | Override the Cursor Agent model used |
| `MULTICACAN_KIMI_PATH` | Custom path to the `kimi` binary |
| `MULTICACAN_KIMI_MODEL` | Override the Kimi model used |
| `MULTICACAN_KIRO_PATH` | Custom path to the `kiro-cli` binary |
| `MULTICACAN_KIRO_MODEL` | Override the Kiro model used |

`MULTICACAN_CLAUDE_ARGS` and `MULTICACAN_CODEX_ARGS` are parsed with POSIX shellword quoting, so values such as `--model "gpt-5.1 codex" --sandbox read-only` are split like a shell command line. Agent arguments are applied in this order: hardcoded Multicacan defaults, daemon-wide env defaults, then per-agent `custom_args` from the task.

### Self-Hosted Server

When connecting to a self-hosted Multicacan instance, the easiest approach is:

```bash
# One command — configures for localhost, authenticates, starts daemon
multicacan setup self-host

# Or for on-premise with custom domains:
multicacan setup self-host --server-url https://api.example.com --app-url https://app.example.com
```

Or configure manually:

```bash
# Set URLs individually
multicacan config set server_url http://localhost:8080
multicacan config set app_url http://localhost:3000

# For production with TLS:
# multicacan config set server_url https://api.example.com
# multicacan config set app_url https://app.example.com

multicacan login
multicacan daemon start
```

### Profiles

Profiles let you run multiple daemons on the same machine — for example, one for production and one for a staging server.

```bash
# Set up a staging profile
multicacan setup self-host --profile staging --server-url https://api-staging.example.com --app-url https://staging.example.com

# Start its daemon
multicacan daemon start --profile staging

# Default profile runs separately
multicacan daemon start
```

Each profile gets its own config directory (`~/.multicacan/profiles/<name>/`), daemon state, health port, and workspace root.

## Workspaces

### List Workspaces

```bash
multicacan workspace list
```

Watched workspaces are marked with `*`. The daemon only processes tasks for watched workspaces.

### Watch / Unwatch

```bash
multicacan workspace watch <workspace-id>
multicacan workspace unwatch <workspace-id>
```

### Get Details

```bash
multicacan workspace get <workspace-id>
multicacan workspace get <workspace-id> --output json
```

### List Members

```bash
multicacan workspace members <workspace-id>
```

## Issues

### List Issues

```bash
multicacan issue list
multicacan issue list --status in_progress
multicacan issue list --priority urgent --assignee "Agent Name"
multicacan issue list --limit 20 --output json
```

Available filters: `--status`, `--priority`, `--assignee`, `--project`, `--limit`.

### Get Issue

```bash
multicacan issue get <id>
multicacan issue get <id> --output json
```

### Create Issue

```bash
multicacan issue create --title "Fix login bug" --description "..." --priority high --assignee "Lambda"
```

Flags: `--title` (required), `--description`, `--status`, `--priority`, `--assignee`, `--parent`, `--project`, `--due-date`.

### Update Issue

```bash
multicacan issue update <id> --title "New title" --priority urgent
```

### Assign Issue

```bash
multicacan issue assign <id> --to "Lambda"
multicacan issue assign <id> --unassign
```

### Change Status

```bash
multicacan issue status <id> in_progress
```

Valid statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.

### Comments

```bash
# List comments
multicacan issue comment list <issue-id>

# Add a comment
multicacan issue comment add <issue-id> --content "Looks good, merging now"

# Reply to a specific comment
multicacan issue comment add <issue-id> --parent <comment-id> --content "Thanks!"

# Delete a comment
multicacan issue comment delete <comment-id>
```

### Subscribers

```bash
# List subscribers of an issue
multicacan issue subscriber list <issue-id>

# Subscribe yourself to an issue
multicacan issue subscriber add <issue-id>

# Subscribe another member or agent by name
multicacan issue subscriber add <issue-id> --user "Lambda"

# Unsubscribe yourself
multicacan issue subscriber remove <issue-id>

# Unsubscribe another member or agent
multicacan issue subscriber remove <issue-id> --user "Lambda"
```

Subscribers receive notifications about issue activity (new comments, status changes, etc.). Without `--user`, the command acts on the caller.

### Execution History

```bash
# List all execution runs for an issue
multicacan issue runs <issue-id>
multicacan issue runs <issue-id> --output json

# View messages for a specific execution run
multicacan issue run-messages <task-id>
multicacan issue run-messages <task-id> --output json

# Incremental fetch (only messages after a given sequence number)
multicacan issue run-messages <task-id> --since 42 --output json
```

The `runs` command shows all past and current executions for an issue, including running tasks. The `run-messages` command shows the detailed message log (tool calls, thinking, text, errors) for a single run. Use `--since` for efficient polling of in-progress runs.

## Projects

Projects group related issues (e.g. a sprint, an epic, a workstream). Every project
belongs to a workspace and can optionally have a lead (member or agent).

### List Projects

```bash
multicacan project list
multicacan project list --status in_progress
multicacan project list --output json
```

Available filters: `--status`.

### Get Project

```bash
multicacan project get <id>
multicacan project get <id> --output json
```

### Create Project

```bash
multicacan project create --title "2026 Week 16 Sprint" --icon "🏃" --lead "Lambda"
```

Flags: `--title` (required), `--description`, `--status`, `--icon`, `--lead`.

### Update Project

```bash
multicacan project update <id> --title "New title" --status in_progress
multicacan project update <id> --lead "Lambda"
```

Flags: `--title`, `--description`, `--status`, `--icon`, `--lead`.

### Change Status

```bash
multicacan project status <id> in_progress
```

Valid statuses: `planned`, `in_progress`, `paused`, `completed`, `cancelled`.

### Delete Project

```bash
multicacan project delete <id>
```

### Associating Issues with Projects

Use the `--project` flag on `issue create` / `issue update` to attach an issue to a
project, or on `issue list` to filter issues by project:

```bash
multicacan issue create --title "Login bug" --project <project-id>
multicacan issue update <issue-id> --project <project-id>
multicacan issue list --project <project-id>
```

## Setup

```bash
# One-command setup for Multicacan Cloud: configure, authenticate, and start the daemon
multicacan setup

# For local self-hosted deployments
multicacan setup self-host

# Custom ports
multicacan setup self-host --port 9090 --frontend-port 4000

# On-premise with custom domains
multicacan setup self-host --server-url https://api.example.com --app-url https://app.example.com
```

`multicacan setup` configures the CLI, opens your browser for authentication, and starts the daemon — all in one step. Use `multicacan setup self-host` to connect to a self-hosted server instead of Multicacan Cloud.

## Configuration

### View Config

```bash
multicacan config show
```

Shows config file path, server URL, app URL, and default workspace.

### Set Values

```bash
multicacan config set server_url https://api.example.com
multicacan config set app_url https://app.example.com
multicacan config set workspace_id <workspace-id>
```

## Autopilot Commands

Autopilots are scheduled/triggered automations that dispatch agent tasks (either by creating an issue or by running an agent directly).

### List Autopilots

```bash
multicacan autopilot list
multicacan autopilot list --status active --output json
```

### Get Autopilot Details

```bash
multicacan autopilot get <id>
multicacan autopilot get <id> --output json   # includes triggers
```

### Create / Update / Delete

```bash
multicacan autopilot create \
  --title "Nightly bug triage" \
  --description "Scan todo issues and prioritize." \
  --agent "Lambda" \
  --mode create_issue

multicacan autopilot update <id> --status paused
multicacan autopilot update <id> --description "New prompt"
multicacan autopilot delete <id>
```

`--mode` currently only accepts `create_issue` (creates a new issue on each run and assigns it to the agent). The server data model also defines `run_only`, but the daemon task path doesn't yet resolve a workspace for runs without an issue, so it's not exposed by the CLI. `--agent` accepts either a name or UUID.

### Manual Trigger

```bash
multicacan autopilot trigger <id>            # Fires the autopilot once, returns the run
```

### Run History

```bash
multicacan autopilot runs <id>
multicacan autopilot runs <id> --limit 50 --output json
```

### Schedule Triggers

```bash
multicacan autopilot trigger-add <autopilot-id> --cron "0 9 * * 1-5" --timezone "America/New_York"
multicacan autopilot trigger-update <autopilot-id> <trigger-id> --enabled=false
multicacan autopilot trigger-delete <autopilot-id> <trigger-id>
```

Only cron-based `schedule` triggers are currently exposed via the CLI. The data model also defines `webhook` and `api` kinds, but there is no server endpoint that fires them yet, so they're not surfaced here.

## Other Commands

```bash
multicacan version              # Show CLI version and commit hash
multicacan update               # Update to latest version
multicacan agent list           # List agents in the current workspace
```

## Output Formats

Most commands support `--output` with two formats:

- `table` — human-readable table (default for list commands)
- `json` — structured JSON (useful for scripting and automation)

```bash
multicacan issue list --output json
multicacan daemon status --output json
```
