# MCP Server Templates

A collection of ready-to-use [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server templates following the **2025-11-25** specification.

Each template is a **standalone project** — copy a folder and start building your own MCP server.

## Templates

| # | Transport | Python | TypeScript | Description |
|---|-----------|--------|------------|-------------|
| 01 | **stdio** | [python/01-stdio-server](python/01-stdio-server/) | [typescript/01-stdio-server](typescript/01-stdio-server/) | Client launches server as subprocess, communicates via stdin/stdout |
| 02 | **Streamable HTTP** | [python/02-streamable-http-server](python/02-streamable-http-server/) | [typescript/02-streamable-http-server](typescript/02-streamable-http-server/) | Server runs as HTTP endpoint with optional SSE streaming |
| 03 | **Auth (Auth0)** | [python/03-auth-oauth-server](python/03-auth-oauth-server/) | — | Streamable HTTP + Auth0 OAuth using Resource Server pattern |
| 04 | **Auth (Okta)** | [python/04-okta-oauth-server](python/04-okta-oauth-server/) | — | Streamable HTTP + Okta OAuth using Resource Server pattern |

## What Each Template Demonstrates

Every template showcases all three MCP server features (Tools, Resources, Prompts) with a different app domain:

| Template | App Domain | Tools | Resources | Prompts |
|----------|-----------|-------|-----------|---------|
| **01 stdio** | Notes app (in-memory) | `add_note`, `search_notes` | `notes://list`, `notes://{name}` | `summarize_notes` |
| **02 HTTP** | Product catalog (JSON file) | `add_product`, `search_products` | `products://all`, `products://{id}` | `analyze_catalog` |
| **03 Auth (Auth0)** | Task manager (JSON file) | `create_task`, `list_tasks` | `tasks://all`, `tasks://{id}` | `prioritize_tasks` |
| **04 Auth (Okta)** | Incident tracker (JSON file) | `create_incident`, `list_incidents` | `incidents://all`, `incidents://{id}` | `triage_incidents` |

## Prerequisites

### Python templates
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) — install with `curl -LsSf https://astral.sh/uv/install.sh | sh`

### TypeScript templates
- Node.js 18+
- npm

## Quick Start

### Python (stdio example)

```bash
cd python/01-stdio-server
uv venv && source .venv/bin/activate
uv pip install "mcp[cli]>=1.2.0"
uv run server.py
```

### TypeScript (stdio example)

```bash
cd typescript/01-stdio-server
npm install
npm run build
node build/index.js
```

## MCP Protocol Version

All templates target **MCP specification 2025-11-25** — the latest protocol revision.

Key protocol details:
- JSON-RPC 2.0 message format
- Capability negotiation during initialization
- Server features: Tools, Resources, Prompts
- Transports: stdio, Streamable HTTP
- OAuth 2.1 support: Resource Server pattern (RFC 9728)

## Guides

- [**MCP OAuth Guide**](docs/mcp-oauth-guide.md) — Deep dive into OAuth in MCP: Resource Server vs Authorization Server patterns, spec evolution, how GitHub does it, and step-by-step Auth0 integration
- [**MCP Primitives Guide**](docs/mcp-primitives-guide.md) — Tools vs Resources vs Prompts: control models, end-to-end use cases, and when to use each primitive. Also covers Prompts vs Skills (slash commands)

## Project Structure

```
mcp-server-templates/
├── README.md
├── .gitignore
├── docs/
│   ├── mcp-oauth-guide.md        # OAuth patterns tutorial
│   └── mcp-primitives-guide.md   # Tools vs Resources vs Prompts
├── python/
│   ├── 01-stdio-server/          # Standalone uv project
│   │   ├── pyproject.toml
│   │   ├── server.py
│   │   └── README.md
│   ├── 02-streamable-http-server/
│   │   ├── pyproject.toml
│   │   ├── server.py
│   │   ├── products.json
│   │   └── README.md
│   ├── 03-auth-oauth-server/
│   │   ├── pyproject.toml
│   │   ├── .env.example
│   │   ├── auth.py
│   │   ├── server.py
│   │   ├── tasks.json
│   │   └── README.md
│   └── 04-okta-oauth-server/
│       ├── pyproject.toml
│       ├── .env.example
│       ├── auth.py
│       ├── server.py
│       ├── incidents.json
│       └── README.md
└── typescript/
    ├── 01-stdio-server/          # Standalone npm project
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── src/index.ts
    │   └── README.md
    └── 02-streamable-http-server/
        ├── package.json
        ├── tsconfig.json
        ├── src/index.ts
        └── README.md
```

## License

MIT
