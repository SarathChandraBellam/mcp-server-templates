# MCP Server Template — Python / Auth0 OAuth (Resource Server)

A task manager MCP server using **Streamable HTTP** transport, secured with **Auth0 OAuth** using the **Resource Server** pattern. The server validates JWTs issued by Auth0 — it does not act as an OAuth authorization server itself.

**Protocol version:** 2025-11-25

> For background on the Resource Server pattern and why the MCP ecosystem adopted it, see [`docs/mcp-oauth-guide.md`](../../docs/mcp-oauth-guide.md).

## What This Demonstrates

| Feature | Implementation |
|---------|---------------|
| **Tools** | `create_task` — add a task, `list_tasks` — list/filter tasks |
| **Resources** | `tasks://all` — list all tasks, `tasks://{id}` — get one task |
| **Prompts** | `prioritize_tasks` — prompt template with `focus` argument (urgency/impact) |
| **Auth** | Auth0 JWT validation (RS256), Protected Resource Metadata (RFC 9728) |

## How the Resource Server Pattern Works

```
MCP Client                          MCP Server (:9000)                Auth0
    │                                    │                               │
    │─── POST /mcp (no token) ──────────>│                               │
    │<── 401 + WWW-Authenticate ─────────│                               │
    │                                    │                               │
    │─── GET /.well-known/               │                               │
    │    oauth-protected-resource/mcp ──>│                               │
    │<── { authorization_servers:        │                               │
    │      ["https://xxx.auth0.com"] }───│                               │
    │                                    │                               │
    │─── OAuth flow with Auth0 ──────────│──────────────────────────────>│
    │    (PKCE, authorization code)      │                    User login │
    │<── JWT access_token ───────────────│<─────────────────────────────│
    │                                    │                               │
    │─── POST /mcp                       │                               │
    │    Authorization: Bearer <JWT> ───>│                               │
    │                                    │── Validate JWT (JWKS, RS256)  │
    │<── MCP response ───────────────────│                               │
```

## Auth0 Setup

You need to create **two things** in Auth0: an API and an Application.

### 1. Create an API (this represents the MCP Server)

1. Go to [Auth0 Dashboard](https://manage.auth0.com/) → **Applications** → **APIs**
2. Click **Create API**
3. Set:
   - **Name:** `MCP Tasks API` (display name, can be anything)
   - **Identifier (Audience):** `https://mcp-tasks-api` (a logical URI — not a real URL)
   - **Signing Algorithm:** RS256
4. Click **Create**

> The **API** tells Auth0: "there is a resource server at this audience that accepts tokens."

### 2. Create an Application (this represents the MCP Client)

1. Go to **Applications** → **Applications** → **Create Application**
2. **Name:** `MCP Test Client` (or any name)
3. **Type:** Pick based on your use case:

| Use Case | App Type | Grant |
|----------|----------|-------|
| Testing with curl/scripts | **Machine to Machine** | Client credentials (no user login) |
| MCP client app (Claude Desktop, etc.) | **Single Page Application** | Authorization code + PKCE (user login) |

4. After creation, **authorize** it for your `MCP Tasks API`
5. From the app's **Settings** tab, note the **Client ID** and **Client Secret**

> The **Application** tells Auth0: "this client is allowed to request tokens for the MCP Tasks API."

### 3. Who Gets What Credentials

This is the key insight of the Resource Server pattern — the server and client need **different** credentials:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Auth0 Dashboard                           │
│                                                                  │
│  API: "MCP Tasks API"         Application: "MCP Test Client"    │
│  Identifier: https://         Client ID: 7yRaZs...              │
│    mcp-tasks-api              Client Secret: YLyz4s...          │
│                                                                  │
└──────────────┬───────────────────────────────┬───────────────────┘
               │                               │
       Used by MCP Server                Used by MCP Client
       (to validate tokens)              (to obtain tokens)
               │                               │
               ▼                               ▼
┌──────────────────────────┐   ┌───────────────────────────────────┐
│  MCP Server (.env)       │   │  MCP Client (config / env)       │
│                          │   │                                   │
│  AUTH0_DOMAIN=hanlak.    │   │  CLIENT_ID=7yRaZs...             │
│    us.auth0.com          │   │  CLIENT_SECRET=YLyz4s...         │
│  AUTH0_AUDIENCE=https:// │   │  AUDIENCE=https://mcp-tasks-api  │
│    mcp-tasks-api         │   │  AUTH0_DOMAIN=hanlak.us.auth0.com│
│                          │   │                                   │
│  ⚠️ NO client_id        │   │  Uses these to call Auth0's      │
│  ⚠️ NO client_secret    │   │  /oauth/token endpoint and get   │
│                          │   │  a JWT access token              │
│  Server only needs the   │   │                                   │
│  domain (to fetch JWKS   │   │  Client never talks to MCP      │
│  public keys) and the    │   │  server about credentials —     │
│  audience (to validate   │   │  only sends the JWT it got      │
│  the token's "aud" claim)│   │  from Auth0                      │
└──────────────────────────┘   └───────────────────────────────────┘
```

**Why the server doesn't need `client_id` or `client_secret`:**

The server validates tokens using **public key cryptography** (RS256). Auth0 signs JWTs with a private key, and publishes the matching public keys at `https://{domain}/.well-known/jwks.json`. The server fetches these public keys to verify signatures — no shared secrets needed.

### 4. Configure the MCP Server

```bash
cp .env.example .env
```

Edit `.env` with **only** the domain and audience:

```
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://mcp-tasks-api
```

> **Tip:** Your Auth0 domain is visible in the top-left of the Auth0 dashboard, or under any app's **Settings** → **Domain**. It often includes a region suffix like `.us.auth0.com` or `.eu.auth0.com`.

## Setup

```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate   # macOS/Linux

uv pip install -r pyproject.toml
```

## Run

```bash
uv run server.py
```

Server starts at `http://127.0.0.1:9000/mcp`.

## MCP Configuration

```json
{
  "mcpServers": {
    "tasks": {
      "url": "http://127.0.0.1:9000/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_AUTH0_JWT>"
      }
    }
  }
}
```

## Testing

### 1. Get a test token from Auth0

```bash
# Machine-to-machine token (client credentials grant)
curl -s -X POST https://YOUR_DOMAIN.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "audience": "https://mcp-tasks-api",
    "grant_type": "client_credentials"
  }' | python -m json.tool
```

Save the `access_token` from the response.

### 2. Verify 401 without token

```bash
curl -s -D - -X POST http://127.0.0.1:9000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0.0"}
    }
  }'
```

Should return `401 Unauthorized` with a `WWW-Authenticate` header.

### 3. Check Protected Resource Metadata

```bash
curl -s http://127.0.0.1:9000/.well-known/oauth-protected-resource/mcp | python -m json.tool
```

Should return JSON with `authorization_servers` pointing to your Auth0 domain.

### 4. Initialize with token

```bash
TOKEN="your_access_token_here"

curl -s -D - -X POST http://127.0.0.1:9000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "1.0.0"}
    }
  }'
```

### 5. List tools (with session)

```bash
curl -s -X POST http://127.0.0.1:9000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "mcp-session-id: SESSION_ID_FROM_STEP_4" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}'
```

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Enter `http://127.0.0.1:9000/mcp` as the server URL (Streamable HTTP transport) and provide the bearer token.

## Seed Data

The template ships with `tasks.json` containing sample tasks. The `create_task` tool writes new entries to this file, so changes persist across server restarts.
