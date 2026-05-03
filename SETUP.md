# Self-Hosting Guide

Deploy Multicacan on your own infrastructure in minutes.

## Architecture

| Component | Description | Technology |
|-----------|-------------|------------|
| **Backend** | REST API + WebSocket server | Go (single binary) |
| **Frontend** | Web application | Next.js 16 |
| **Database** | Primary data store | PostgreSQL 17 with pgvector |

Each user who runs AI agents locally also installs the **`multica` CLI** and runs the **agent daemon** on their own machine.

---

## Step-by-Step Setup

### Step 1 — Start the Server

**Prerequisites:** Docker and Docker Compose.

```bash
git clone https://github.com/canfidelity/multicacan.git
cd multicacan
make selfhost
```

`make selfhost` automatically creates `.env` from the example, generates a random `JWT_SECRET`, and starts all services via Docker Compose.

Once ready:

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8080

### Step 2 — Log In

Open http://localhost:3000 in your browser. The Docker self-host stack defaults to `APP_ENV=production`, and there is no fixed verification code by default. Pick one of the following to log in:

- **Recommended (production):** configure `RESEND_API_KEY` in `.env`, then restart the backend. Real verification codes will be sent to the email address you enter.
- **Without email configured:** the verification code is generated server-side and printed to the backend container logs:
  ```bash
  docker compose -f docker-compose.selfhost.yml logs backend | grep "Verification code"
  ```
- **Deterministic local/private testing:** set `APP_ENV=development` and `MULTICA_DEV_VERIFICATION_CODE=888888` in `.env`, then restart the backend.

> **Warning:** do **not** set `MULTICA_DEV_VERIFICATION_CODE` on a publicly reachable instance.

### Step 3 — Install CLI & Start Daemon

The daemon runs on your local machine (not inside Docker). It detects installed AI agent CLIs, registers them with the server, and executes tasks when agents are assigned work.

#### a) Install the CLI

Download the daemon binary for your platform from [GitHub Releases](https://github.com/canfidelity/multicacan/releases/tag/latest):

```bash
# macOS (Apple Silicon)
curl -L https://github.com/canfidelity/multicacan/releases/download/latest/multicacan-darwin-arm64 -o /usr/local/bin/multica
chmod +x /usr/local/bin/multica
codesign -s - /usr/local/bin/multica

# macOS (Intel)
curl -L https://github.com/canfidelity/multicacan/releases/download/latest/multicacan-darwin-amd64 -o /usr/local/bin/multica
chmod +x /usr/local/bin/multica
codesign -s - /usr/local/bin/multica

# Linux (amd64)
curl -L https://github.com/canfidelity/multicacan/releases/download/latest/multicacan-linux-amd64 -o /usr/local/bin/multica
chmod +x /usr/local/bin/multica
```

#### b) Install an AI agent

```bash
npm install -g @anthropic-ai/claude-code
```

#### c) One-command setup

```bash
multica setup self-host
```

This automatically:
1. Configures the CLI to connect to `localhost` (ports 8080/3000)
2. Opens your browser for authentication
3. Discovers your workspaces
4. Starts the daemon in the background

For on-premise deployments with custom domains:

```bash
multica setup self-host --server-url https://api.example.com --app-url https://app.example.com
```

To verify the daemon is running:

```bash
multica daemon status
```

### Step 4 — Verify & Start Using

1. Open your workspace in the web app at http://localhost:3000
2. Navigate to **Settings → Runtimes** — you should see your machine listed
3. Go to **Settings → Agents** and create a new agent
4. Create an issue and assign it to your agent — it will pick up the task automatically

---

## Stopping Services

```bash
# Stop the Docker Compose services (backend, frontend, database)
make selfhost-stop

# Stop the local daemon
multica daemon stop
```

## Upgrading

```bash
git pull origin main
docker compose -f docker-compose.selfhost.yml pull
docker compose -f docker-compose.selfhost.yml up -d
```

---

## Manual CLI Configuration

If you prefer configuring the CLI step by step instead of `multica setup`:

```bash
multica config set server_url http://localhost:8080
multica config set app_url http://localhost:3000
multica login
multica daemon start
```

For production deployments with TLS:

```bash
multica config set server_url https://api.example.com
multica config set app_url https://app.example.com
multica login
multica daemon start
```

---

## Extra Features (This Fork)

### Web Preview

The daemon automatically detects local ports where agents run dev servers. Accessible from the sidebar via **Web Preview**.

### iOS Simulator

```bash
bunx serve-sim --detach
```

Accessible from the sidebar via **Simulator**.
