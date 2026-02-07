# MCP Server Template — Python / stdio Transport

A minimal MCP server using **stdio** transport, built with the Python `mcp` SDK (FastMCP).

**Protocol version:** 2025-11-25

## What This Demonstrates

| Feature | Implementation |
|---------|---------------|
| **Tools** | `add_note` — save a note, `search_notes` — keyword search |
| **Resources** | `notes://list` — list all notes, `notes://{name}` — read a specific note |
| **Prompts** | `summarize_notes` — prompt template with `style` argument (brief/detailed) |

## How stdio Transport Works

1. The MCP client launches this server as a **subprocess**
2. The client writes JSON-RPC messages to the server's **stdin**
3. The server writes JSON-RPC responses to **stdout**
4. Messages are newline-delimited (no embedded newlines)
5. Logging goes to **stderr** only (never stdout)

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

The server will start listening on stdin/stdout for JSON-RPC messages.

## MCP Configuration

```json
{
  "mcpServers": {
    "notes": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/python/01-stdio-server",
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
npx @modelcontextprotocol/inspector uv run server.py
```

