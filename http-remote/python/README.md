# MCP Server Template — Python / http-remote

Minimal calculator MCP server using **Streamable HTTP** transport and the Python `mcp` SDK.

**Protocol version:** 2025-11-25

## Tools

- `add(a, b)` returns the sum
- `sub(a, b)` returns the difference

## Setup

```bash
uv venv
source .venv/bin/activate
uv pip install "mcp[cli]>=1.2.0"
```

## Run

```bash
uv run server.py
```

The server listens on `http://127.0.0.1:8000/mcp`.

## MCP Configuration

```json
{
  "mcpServers": {
    "calculator": {
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}
```

For clients that launch the server locally instead of connecting by URL:

```json
{
  "mcpServers": {
    "calculator": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/http-remote/python",
        "run",
        "server.py"
      ]
    }
  }
}
```

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Then connect to `http://127.0.0.1:8000/mcp` using Streamable HTTP.
