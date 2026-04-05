# MCP Server Template — Python / stdio

Minimal calculator MCP server using **stdio** transport and the Python `mcp` SDK.

**Protocol version:** 2025-11-25

## Tools

- `add(a, b)` returns the sum
- `sub(a, b)` returns the difference

## Setup & Run

```bash
uv sync
uv run server.py
```

## MCP Configuration

```json
{
  "mcpServers": {
    "calculator": {
      "command": "uv",
      "args": [
        "--directory",
        "/ABSOLUTE/PATH/TO/stdio/python",
        "run",
        "server.py"
      ]
    }
  }
}
```

## Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector uv run server.py
```
