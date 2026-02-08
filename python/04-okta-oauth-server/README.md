# MCP Server Template — Python / Okta OAuth (Resource Server)

An incident tracker MCP server using **Streamable HTTP** transport, secured with **Okta OAuth** using the **Resource Server** pattern. The server validates JWTs issued by Okta — it does not act as an OAuth authorization server itself.

**Protocol version:** 2025-11-25

> For background on the Resource Server pattern and why the MCP ecosystem adopted it, see [`docs/mcp-oauth-guide.md`](../../docs/mcp-oauth-guide.md).

## What This Demonstrates

| Feature | Implementation |
|---------|---------------|
| **Tools** | `create_incident` — log an incident, `list_incidents` — list/filter incidents |
| **Resources** | `incidents://all` — list all incidents, `incidents://{id}` — get one incident |
| **Prompts** | `triage_incidents` — prompt template with `focus` argument (severity/patterns) |
| **Auth** | Okta JWT validation (RS256), Protected Resource Metadata (RFC 9728) |

## How the Resource Server Pattern Works

```
MCP Client                          MCP Server (:9001)                Okta
    │                                    │                               │
    │─── POST /mcp (no token) ──────────>│                               │
    │<── 401 + WWW-Authenticate ─────────│                               │
    │                                    │                               │
    │─── GET /.well-known/               │                               │
    │    oauth-protected-resource/mcp ──>│                               │
    │<── { authorization_servers:        │                               │
    │      ["https://x.okta.com/        │                               │
    │        oauth2/default"] } ────────│                               │
    │                                    │                               │
    │─── OAuth flow with Okta ───────────│──────────────────────────────>│
    │    (PKCE, authorization code)      │                    User login │
    │<── JWT access_token ───────────────│<─────────────────────────────│
    │                                    │                               │
    │─── POST /mcp                       │                               │
    │    Authorization: Bearer <JWT> ───>│                               │
    │                                    │── Validate JWT (JWKS, RS256)  │
    │<── MCP response ───────────────────│                               │
```

## Okta vs Auth0: Key Differences

While both use the same Resource Server pattern and RS256 JWT validation, Okta's token format differs:

| Aspect | Auth0 | Okta |
|--------|-------|------|
| **Issuer format** | `https://{domain}/` | `https://{domain}/oauth2/{server_id}` |
| **JWKS URL** | `https://{domain}/.well-known/jwks.json` | `https://{domain}/oauth2/{server_id}/v1/keys` |
| **Scopes claim** | `scope` (space-separated string) | `scp` (JSON array) |
| **Client ID claim** | `sub` (for M2M grants) | `cid` |
| **Auth Server** | Implicit (one per tenant) | Explicit (default or custom server ID) |
| **Discovery URL** | `https://{domain}/.well-known/openid-configuration` | `https://{domain}/oauth2/{server_id}/.well-known/openid-configuration` |

## Okta Setup

You need to configure **three things** in Okta: an Authorization Server, a Client Application, and a scope.

### 1. Configure an Authorization Server (this issues tokens)

Okta provides a **default** authorization server, or you can create a custom one.

**Option A: Use the default server (simplest)**
1. Go to [Okta Admin Console](https://your-org-admin.okta.com/) → **Security** → **API**
2. You'll see a **default** authorization server already listed
3. Note its **Issuer URI** — it looks like `https://your-org.okta.com/oauth2/default`
4. Under **Scopes**, add any custom scopes you need (e.g., `incidents:read`, `incidents:write`)

**Option B: Create a custom authorization server**
1. Go to **Security** → **API** → **Add Authorization Server**
2. Set:
   - **Name:** `MCP Incidents API`
   - **Audience:** `https://mcp-incidents-api`
   - **Description:** `Authorization server for MCP incident tracker`
3. After creation, note the **Issuer URI** and **Server ID**
4. Add scopes and access policies as needed

### 2. Create an Application (this represents the MCP Client)

1. Go to **Applications** → **Applications** → **Create App Integration**
2. Choose based on your use case:

| Use Case | Sign-in Method | App Type |
|----------|---------------|----------|
| Testing with curl/scripts | **API Services** | Machine-to-Machine (client credentials) |
| MCP client app (Claude Desktop, etc.) | **OIDC** | Single-Page Application (authorization code + PKCE) |

3. Configure the app:
   - **Name:** `MCP Test Client`
   - **Grant types:** Client Credentials (for M2M) or Authorization Code + PKCE (for user-facing)
   - **Redirect URI:** `http://localhost:3000/callback` (for authorization code flow)
4. Note the **Client ID** and **Client Secret**

### 3. Assign the Application to the Authorization Server

1. Go to **Security** → **API** → select your authorization server
2. Under **Access Policies**, create or edit a policy
3. Add a **Rule** that grants your application access with the desired scopes

### 4. Who Gets What Credentials

```
┌──────────────────────────────────────────────────────────────────┐
│                      Okta Admin Console                           │
│                                                                    │
│  Auth Server: "default"           Application: "MCP Test Client"  │
│  Audience: https://               Client ID: 0oa1234...           │
│    mcp-incidents-api              Client Secret: AbCdEf...        │
│  Issuer: https://your-org.                                        │
│    okta.com/oauth2/default                                        │
│                                                                    │
└──────────────┬───────────────────────────────┬────────────────────┘
               │                               │
       Used by MCP Server                Used by MCP Client
       (to validate tokens)              (to obtain tokens)
               │                               │
               ▼                               ▼
┌──────────────────────────────┐   ┌───────────────────────────────────┐
│  MCP Server (.env)            │   │  MCP Client (config / env)       │
│                               │   │                                   │
│  OKTA_DOMAIN=your-org.        │   │  CLIENT_ID=0oa1234...            │
│    okta.com                   │   │  CLIENT_SECRET=AbCdEf...         │
│  OKTA_AUDIENCE=https://       │   │  AUDIENCE=https://               │
│    mcp-incidents-api          │   │    mcp-incidents-api             │
│  OKTA_AUTH_SERVER_ID=default  │   │  OKTA_DOMAIN=your-org.okta.com  │
│                               │   │                                   │
│  ⚠️ NO client_id             │   │  Uses these to call Okta's       │
│  ⚠️ NO client_secret         │   │  /oauth2/default/v1/token and    │
│                               │   │  get a JWT access token          │
│  Server only needs the domain │   │                                   │
│  (to fetch JWKS public keys), │   │  Client never talks to MCP      │
│  audience (to validate the    │   │  server about credentials —      │
│  token's "aud" claim), and    │   │  only sends the JWT it got       │
│  auth server ID               │   │  from Okta                       │
└──────────────────────────────┘   └───────────────────────────────────┘
```

### 5. Configure the MCP Server

```bash
cp .env.example .env
```

Edit `.env`:

```
OKTA_DOMAIN=your-org.okta.com
OKTA_AUDIENCE=https://mcp-incidents-api
OKTA_AUTH_SERVER_ID=default
```

> **Tip:** Your Okta domain is visible in the top-right of the Okta Admin Console. For Okta developer accounts it's typically `dev-12345678.okta.com`.

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

Server starts at `http://127.0.0.1:9001/mcp`.

## MCP Configuration

```json
{
  "mcpServers": {
    "incidents": {
      "url": "http://127.0.0.1:9001/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_OKTA_JWT>"
      }
    }
  }
}
```

## Testing

### 1. Get a test token from Okta

```bash
# Machine-to-machine token (client credentials grant)
curl -s -X POST https://YOUR_DOMAIN.okta.com/oauth2/default/v1/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials\
&client_id=YOUR_CLIENT_ID\
&client_secret=YOUR_CLIENT_SECRET\
&scope=incidents:read incidents:write" | python -m json.tool
```

Save the `access_token` from the response.

### 2. Verify 401 without token

```bash
curl -s -D - -X POST http://127.0.0.1:9001/mcp \
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
curl -s http://127.0.0.1:9001/.well-known/oauth-protected-resource/mcp | python -m json.tool
```

Should return JSON with `authorization_servers` pointing to your Okta authorization server.

### 4. Initialize with token

```bash
TOKEN="your_access_token_here"

curl -s -D - -X POST http://127.0.0.1:9001/mcp \
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
curl -s -X POST http://127.0.0.1:9001/mcp \
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

Enter `http://127.0.0.1:9001/mcp` as the server URL (Streamable HTTP transport) and provide the bearer token.

## Seed Data

The template ships with `incidents.json` containing sample incidents. The `create_incident` tool writes new entries to this file, so changes persist across server restarts.
