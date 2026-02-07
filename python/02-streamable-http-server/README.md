# MCP Server Template — Python / Streamable HTTP Transport

A product catalog MCP server using **Streamable HTTP** transport, built with the Python `mcp` SDK (FastMCP). Data is persisted to a JSON file.

**Protocol version:** 2025-11-25

## What This Demonstrates

| Feature | Implementation |
|---------|---------------|
| **Tools** | `add_product` — add to catalog, `search_products` — keyword search |
| **Resources** | `products://all` — list catalog, `products://{id}` — get one product |
| **Prompts** | `analyze_catalog` — prompt template with `focus` argument (pricing/inventory) |

## How Streamable HTTP Transport Works

Unlike stdio (subprocess), the server runs as a **standalone HTTP process**:

1. Server listens on a single HTTP endpoint (e.g. `http://127.0.0.1:8000/mcp`)
2. Clients send JSON-RPC messages via **POST** requests
3. Server responds with `application/json` or `text/event-stream` (SSE)
4. Server assigns an `mcp-session-id` header on initialization — clients must include it in subsequent requests
5. Clients can **GET** the endpoint to receive server-initiated notifications via SSE
6. Clients **DELETE** the endpoint to terminate a session

```
Client                          Server (http://127.0.0.1:8000/mcp)
  │                                │
  │─── POST initialize ───────────>│
  │<── InitializeResult ───────────│  (+ mcp-session-id header)
  │                                │
  │─── POST tools/call ───────────>│  (+ mcp-session-id header)
  │<── Tool result ────────────────│
  │                                │
  │─── GET (SSE stream) ──────────>│  (optional: server notifications)
  │<── SSE events ─────────────────│
  │                                │
  │─── DELETE ─────────────────────>│  (terminate session)
```

## Setup

```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate   # macOS/Linux
# .venv\Scripts\activate    # Windows

uv pip install "mcp[cli]>=1.2.0"
```

## Run

```bash
uv run server.py
```

Server starts at `http://127.0.0.1:8000/mcp`.

## MCP Configuration

```json
{
  "mcpServers": {
    "products": {
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}
```

For clients that don't support remote URLs and need to launch the server:

```json
{
  "mcpServers": {
    "products": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/python/02-streamable-http-server",
        "run",
        "server.py"
      ]
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/` with the actual path to this directory.

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Then enter `http://127.0.0.1:8000/mcp` as the server URL (transport type: Streamable HTTP).

## Testing with curl

### 1. Initialize (get session ID)

```bash
curl -s -D - -X POST http://127.0.0.1:8000/mcp \
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

Look for the `mcp-session-id` header in the response. Use it in all subsequent requests.

### 2. Send initialized notification

```bash
curl -s -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION_ID_HERE" \
  -d '{"jsonrpc": "2.0", "method": "notifications/initialized"}'
```

### 3. List tools

```bash
curl -s -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION_ID_HERE" \
  -d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}'
```

### 4. Call a tool

```bash
curl -s -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION_ID_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_products",
      "arguments": {"query": "electronics"}
    }
  }'
```

## Seed Data

The template ships with `products.json` containing sample products. The `add_product` tool writes new entries to this file, so changes persist across server restarts.
