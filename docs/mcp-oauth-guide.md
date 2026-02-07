# MCP OAuth Guide: Securing MCP Servers with OAuth 2.1

A deep dive into how OAuth works in the Model Context Protocol, the architectural patterns, and why the industry settled on the Resource Server approach.

## Table of Contents

- [Why OAuth in MCP?](#why-oauth-in-mcp)
- [The Two OAuth Architectures](#the-two-oauth-architectures)
- [The Spec Evolution: Issue #205](#the-spec-evolution-issue-205)
- [How GitHub Does It](#how-github-does-it)
- [RFC Standards Involved](#rfc-standards-involved)
- [Resource Server Pattern Deep Dive](#resource-server-pattern-deep-dive)
- [When to Use Which Pattern](#when-to-use-which-pattern)
- [References](#references)

---

## Why OAuth in MCP?

MCP servers expose tools, resources, and prompts to AI clients. When these servers access user data, external APIs, or perform actions on behalf of users, they need to know **who** is making the request and **what** they're allowed to do.

Without auth, any MCP client can call any tool — fine for local development, dangerous for production.

OAuth 2.1 solves this by providing:
- **User identity** — the server knows who is making requests
- **Scoped access** — tokens carry permissions (e.g., `tasks:read`, `tasks:write`)
- **Token lifecycle** — tokens expire, can be refreshed, and can be revoked
- **Standard flow** — every MCP client can implement the same protocol

The MCP spec (2025-11-25) makes OAuth **optional** but defines exactly how it should work when used, specifically for HTTP-based transports.

---

## The Two OAuth Architectures

There are two fundamentally different ways to add OAuth to an MCP server. Understanding the distinction is critical.

### Architecture A: Authorization Server (Full OAuth Proxy)

The MCP server implements the **full OAuth Authorization Server** — it has `/authorize`, `/token`, and `/register` endpoints. It proxies the actual authentication to an upstream provider (Auth0, Okta, etc.) but issues its **own** tokens.

```
MCP Client                     MCP Server (AS + RS)                Auth0
    │                               │                                │
    │── GET /.well-known/           │                                │
    │   oauth-authorization-server >│                                │
    │<─ AS metadata ────────────────│                                │
    │                               │                                │
    │── POST /register ────────────>│  (Dynamic Client Registration) │
    │<─ client_id, client_secret ───│                                │
    │                               │                                │
    │── GET /authorize ────────────>│── Redirect to Auth0 ──────────>│
    │                               │                      User login│
    │<─ Auth code (via redirect) ───│<── Auth0 callback ────────────│
    │                               │                                │
    │── POST /token ───────────────>│  (Issues its OWN token)        │
    │<─ MCP access token ──────────│                                │
    │                               │                                │
    │── POST /mcp (Bearer token) ──>│  Validates own token           │
    │<─ MCP response ──────────────│                                │
```

**Key characteristics:**
- MCP server manages the full OAuth lifecycle
- Server issues its own tokens (Auth0 tokens never reach the client)
- Requires implementing `OAuthAuthorizationServerProvider` interface
- Server needs storage for clients, auth codes, tokens
- More complex (~200+ lines of auth code)

**Used by:** [NapthaAI/http-oauth-mcp-server](https://github.com/NapthaAI/http-oauth-mcp-server), [Cloudflare Agents](https://developers.cloudflare.com/agents/model-context-protocol/authorization/)

### Architecture B: Resource Server (Token Validation Only)

The MCP server is **only a Resource Server** — it validates tokens issued by an external Authorization Server (Auth0). The MCP client handles OAuth directly with Auth0.

```
MCP Client                     MCP Server (RS only)                Auth0 (AS)
    │                               │                                │
    │── POST /mcp (no token) ──────>│                                │
    │<─ 401 + WWW-Authenticate ─────│                                │
    │   (resource_metadata URL)     │                                │
    │                               │                                │
    │── GET /.well-known/           │                                │
    │   oauth-protected-resource ──>│                                │
    │<─ { authorization_servers:    │                                │
    │     ["https://x.auth0.com"] } │                                │
    │                               │                                │
    │── GET https://x.auth0.com/    │                                │
    │   .well-known/openid-config ──│───────────────────────────────>│
    │<─ AS metadata ────────────────│<──────────────────────────────│
    │                               │                                │
    │── Browser: Auth0 /authorize ──│───────────────────────────────>│
    │   (PKCE, resource indicator)  │                      User login│
    │<─ Auth code ──────────────────│<──────────────────────────────│
    │                               │                                │
    │── POST Auth0 /oauth/token ────│───────────────────────────────>│
    │<─ JWT access token ───────────│<──────────────────────────────│
    │                               │                                │
    │── POST /mcp                   │                                │
    │   Authorization: Bearer JWT ─>│── Validate JWT:                │
    │                               │   - JWKS signature (RS256)     │
    │                               │   - Issuer, audience, expiry   │
    │<─ MCP response ──────────────│                                │
```

**Key characteristics:**
- MCP server only validates tokens — no OAuth endpoints
- Auth0 handles all OAuth flows (login, consent, token issuance)
- Server fetches Auth0's JWKS to verify JWT signatures
- Stateless — no need to store clients, codes, or tokens
- Much simpler (~60 lines of auth code)

**Used by:** [GitHub MCP Server](https://github.com/github/github-mcp-server), most enterprise deployments

### Comparison

| Aspect | Authorization Server | Resource Server |
|--------|---------------------|-----------------|
| **Complexity** | High (~200+ lines) | Low (~60 lines) |
| **Token control** | Full — issues own tokens | None — validates provider tokens |
| **Statefulness** | Stateful (stores clients, codes, tokens) | Stateless (only caches JWKS) |
| **Auth0 tokens exposed to client** | No (isolated server-side) | Yes (client holds Auth0 JWT) |
| **Dynamic Client Registration** | Supported | Not needed |
| **Enterprise compatibility** | Requires custom integration | Works with existing IdPs out of the box |
| **Spec compliance** | Full | Full (via RFC 9728) |
| **Production examples** | NapthaAI, Cloudflare | GitHub, AWS Cognito example |

---

## The Spec Evolution: Issue #205

The MCP authorization specification went through a significant architectural debate that shaped how OAuth works today.

### The Problem

The original MCP auth spec (early 2025) required every MCP server to implement a **full OAuth Authorization Server**:
- Discovery endpoints (`/.well-known/oauth-authorization-server`)
- Dynamic Client Registration (`/register`)
- Authorization endpoint (`/authorize`)
- Token endpoint (`/token`)

This meant every MCP server developer had to build or proxy a complete OAuth stack — even if their organization already had Auth0, Okta, Entra ID, or AWS Cognito deployed.

### The Discussion

[Issue #205: "Treat the MCP server as an OAuth resource server rather than an authorization server"](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/205) was opened on the MCP spec repository. Key arguments:

**From enterprise engineers (AWS, Microsoft):**
> "This increases adoptability of MCP in enterprise scenarios where OAuth authorization servers are already deployed." — The separation lets organizations reuse existing identity infrastructure without modification.

**From practitioners:**
> "Session management, persistence layers (Redis), and scaling challenges create unnecessary overhead... Stick to plain OAuth — it's battle-tested." — Building a custom OAuth AS for every MCP server is reinventing the wheel.

> Existing attempts to wire enterprise IdPs (like Microsoft Entra ID) into the AS model were described as "extremely hacky solutions."

**The counter-argument:**
Some noted that the existing spec already had provisions for pointing to external providers via server metadata discovery. However, the community felt the spec didn't clearly separate the RS and AS roles.

### The Resolution

**The issue was approved and closed.** The MCP spec (2025-11-25) now clearly supports both patterns:

1. **Resource Server pattern** via RFC 9728 (Protected Resource Metadata) — the MCP server advertises its authorization server(s), and clients do OAuth directly with those providers.

2. **Authorization Server pattern** remains supported for cases where the MCP server needs to proxy or wrap OAuth flows.

The spec requires MCP servers to implement `/.well-known/oauth-protected-resource` (RFC 9728), which works equally well for both patterns.

---

## How GitHub Does It

GitHub's official MCP server (`github/github-mcp-server`) is the most prominent real-world example. Here's how they implement OAuth:

### Architecture

GitHub uses the **Resource Server** pattern:

1. **GitHub hosts the MCP server** at `https://api.githubcopilot.com/mcp/`
2. **The MCP client** (VS Code, Claude Desktop) handles OAuth with GitHub's OAuth App / GitHub App
3. **The MCP server receives bearer tokens** and validates them against GitHub's API
4. **The server uses tokens** to make GitHub API calls on behalf of the user

GitHub does NOT implement `/authorize`, `/token`, or `/register` endpoints in their MCP server.

### Scope-Based Tool Filtering

A notable feature: GitHub's MCP server dynamically shows/hides tools based on the token's OAuth scopes:

- If your token has `repo` scope → repository management tools are available
- If your token only has `read:user` → only user profile tools appear
- Tools requiring scopes your token doesn't have are automatically hidden

This is a powerful pattern: the server inspects the token's granted scopes and filters its capabilities accordingly, rather than returning 403 errors.

### Key Takeaway

If the world's largest developer platform chose the Resource Server pattern for their MCP server, it's a strong signal that this is the right approach for most production deployments.

---

## RFC Standards Involved

The MCP OAuth spec builds on several established RFCs. Here's what each one does and why it matters:

### RFC 9728 — OAuth 2.0 Protected Resource Metadata

**What:** Defines how a Resource Server (your MCP server) advertises which Authorization Servers can issue tokens for it.

**How it works in MCP:**
- MCP server serves a JSON document at `/.well-known/oauth-protected-resource`
- The document contains `authorization_servers` — a list of URLs where clients should go to get tokens
- Clients discover Auth0 (or any provider) through this mechanism

```json
{
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://your-tenant.auth0.com"],
  "scopes_supported": ["tasks:read", "tasks:write"],
  "bearer_methods_supported": ["header"]
}
```

**Why it matters:** This is the glue that connects the MCP server (RS) to Auth0 (AS) without coupling them.

### RFC 8707 — Resource Indicators for OAuth 2.0

**What:** Allows clients to specify **which resource** they want a token for during the OAuth flow.

**How it works in MCP:**
- Client includes `resource=https://mcp.example.com/mcp` in the authorization and token requests
- The Authorization Server binds the token to that specific resource
- The MCP server validates the token's `aud` (audience) claim matches itself

**Why it matters:** Prevents token confusion attacks — a token issued for Server A can't be used at Server B.

### RFC 8414 — OAuth 2.0 Authorization Server Metadata

**What:** Defines how clients discover an Authorization Server's capabilities and endpoints.

**How it works in MCP:**
- Client fetches `https://your-tenant.auth0.com/.well-known/openid-configuration`
- Gets back: authorization endpoint, token endpoint, supported scopes, PKCE support, etc.
- Client uses this to drive the OAuth flow

### OAuth 2.1 (draft-ietf-oauth-v2-1)

**What:** The latest OAuth specification, consolidating best practices from OAuth 2.0 and its extensions.

**Key requirements for MCP:**
- **PKCE is mandatory** — prevents authorization code interception
- **S256 code challenge method** required when technically capable
- **Bearer tokens via Authorization header** only (not query string)
- **Refresh token rotation** for public clients

---

## Resource Server Pattern Deep Dive

### Credential Separation: Who Gets What

The most important concept to understand is that the MCP server and MCP client need **completely different credentials**. They never share secrets.

**In Auth0, you create two things:**

| Auth0 Object | What It Represents | Who Uses It |
|--------------|-------------------|-------------|
| **API** (identifier + signing algo) | The MCP Server (resource) | MCP Server reads the `identifier` as its `audience` |
| **Application** (client_id + secret) | The MCP Client | MCP Client uses these to get tokens from Auth0 |

**What goes where:**

```
MCP Server (.env)                      MCP Client (config)
─────────────────                      ───────────────────
AUTH0_DOMAIN=tenant.us.auth0.com       CLIENT_ID=abc123...
AUTH0_AUDIENCE=https://my-mcp-api      CLIENT_SECRET=xyz789...
                                       AUDIENCE=https://my-mcp-api
❌ No client_id                        AUTH0_DOMAIN=tenant.us.auth0.com
❌ No client_secret
```

**Why the server doesn't need client credentials:**

Auth0 signs JWTs with a **private key** and publishes the matching **public keys** at `https://{domain}/.well-known/jwks.json`. The MCP server fetches these public keys to verify JWT signatures — this is standard RS256 public key cryptography. No shared secret is needed between the server and Auth0.

The server only needs:
- **Domain** — to know where to fetch the JWKS public keys
- **Audience** — to verify the token's `aud` claim matches this server (prevents using a token meant for a different API)

The client only needs:
- **Client ID + Secret** — to authenticate itself with Auth0 and request tokens
- **Audience** — to tell Auth0 which API the token is for
- **Domain** — to know Auth0's OAuth endpoints

### Step-by-Step Flow

Here's the complete flow of how an MCP client authenticates with an Auth0-protected MCP server, step by step.

### Step 1: Client Discovers It Needs Auth

The MCP client sends a request to the MCP server without a token:

```http
POST /mcp HTTP/1.1
Host: 127.0.0.1:9000
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize",...}
```

The server responds with a 401:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="http://127.0.0.1:9000/.well-known/oauth-protected-resource/mcp"
```

### Step 2: Client Fetches Protected Resource Metadata

```http
GET /.well-known/oauth-protected-resource/mcp HTTP/1.1
Host: 127.0.0.1:9000
```

Response:

```json
{
  "resource": "http://127.0.0.1:9000/mcp",
  "authorization_servers": ["https://your-tenant.auth0.com"],
  "scopes_supported": ["openid", "profile"],
  "bearer_methods_supported": ["header"]
}
```

### Step 3: Client Discovers Auth0's Endpoints

The client fetches Auth0's OpenID Connect discovery document:

```http
GET /.well-known/openid-configuration HTTP/1.1
Host: your-tenant.auth0.com
```

Response includes `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `code_challenge_methods_supported`, etc.

### Step 4: Client Does OAuth with Auth0

The client opens a browser to Auth0's authorization endpoint:

```
https://your-tenant.auth0.com/authorize?
  response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=http://localhost:3000/callback
  &scope=openid profile
  &code_challenge=...          (PKCE S256)
  &code_challenge_method=S256
  &resource=http://127.0.0.1:9000/mcp   (RFC 8707)
```

The user logs in via Auth0 (email, Google, GitHub, etc.), consents, and Auth0 redirects back with an authorization code.

### Step 5: Client Exchanges Code for Token

```http
POST /oauth/token HTTP/1.1
Host: your-tenant.auth0.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE_HERE
&redirect_uri=http://localhost:3000/callback
&client_id=YOUR_CLIENT_ID
&code_verifier=...             (PKCE verifier)
&resource=http://127.0.0.1:9000/mcp
```

Auth0 returns a JWT access token.

### Step 6: Client Sends Authenticated MCP Request

```http
POST /mcp HTTP/1.1
Host: 127.0.0.1:9000
Content-Type: application/json
Accept: application/json, text/event-stream
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
```

### Step 7: Server Validates the JWT

The MCP server:

1. **Extracts** the JWT from the `Authorization: Bearer` header
2. **Fetches Auth0's JWKS** from `https://your-tenant.auth0.com/.well-known/jwks.json` (cached)
3. **Verifies the signature** using the RS256 public key from JWKS
4. **Checks claims:**
   - `iss` matches `https://your-tenant.auth0.com/`
   - `aud` matches the configured audience (the MCP server's resource identifier)
   - `exp` hasn't passed (token not expired)
   - `scope` or `permissions` contains required scopes
5. **Serves the MCP response** if valid, or returns 401/403 if not

This is the entire auth flow. The MCP server never touches Auth0's OAuth endpoints — it only validates the JWT that Auth0 issued.

---

## When to Use Which Pattern

### Use Resource Server (Recommended) when:

- You have an existing identity provider (Auth0, Okta, Entra ID, Cognito)
- You want a stateless MCP server (no session/token storage)
- You're deploying in an enterprise environment
- You want the simplest possible auth implementation
- Your MCP clients support OAuth discovery (most modern clients do)

### Use Authorization Server when:

- You need to issue your own tokens (e.g., different lifetime/scopes than the upstream provider)
- You want to hide the upstream provider from clients (token isolation)
- You need Dynamic Client Registration at the MCP server level
- Your MCP clients don't support the Resource Server discovery flow
- You're building a multi-tenant platform where each tenant connects different IdPs

### Decision Flowchart

```
Do you have an existing IdP (Auth0, Okta, etc.)?
  ├── Yes → Resource Server pattern
  │         (validate their tokens, serve protected resource metadata)
  │
  └── No  → Do you need to issue your own tokens?
              ├── Yes → Authorization Server pattern
              │         (implement full OAuth proxy)
              │
              └── No  → Consider adding Auth0/Okta (free tiers available)
                        → Then use Resource Server pattern
```

---

## References

### MCP Specification
- [MCP Authorization Spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

### Spec Discussion
- [Issue #205: Treat MCP server as resource server](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/205) — The pivotal discussion that shaped MCP OAuth

### RFC Standards
- [RFC 9728 — Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8707 — Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 8414 — Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)

### Open Source Implementations
- [github/github-mcp-server](https://github.com/github/github-mcp-server) — GitHub's official MCP server (Resource Server pattern)
- [NapthaAI/http-oauth-mcp-server](https://github.com/NapthaAI/http-oauth-mcp-server) — Full OAuth proxy with Auth0
- [Cloudflare Agents + Auth0](https://developers.cloudflare.com/agents/model-context-protocol/authorization/) — Production Auth0 integration
- [empires-security/mcp-oauth2-aws-cognito](https://github.com/empires-security/mcp-oauth2-aws-cognito) — Provider-agnostic Resource Server
- [mcp-auth](https://github.com/mcp-auth/) — Python MCP auth library
- [auth0/auth0-mcp-server](https://github.com/auth0/auth0-mcp-server) — Auth0's official MCP server
