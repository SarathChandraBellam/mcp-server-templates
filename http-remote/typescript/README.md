# MCP Server Template — TypeScript / http-remote

Minimal calculator MCP server using **Streamable HTTP** transport and the TypeScript MCP SDK.

**Protocol version:** 2025-11-25

## Tools

- `add(a, b)` returns the sum
- `sub(a, b)` returns the difference

## Setup

```bash
npm install
```

## Run

```bash
npm run build
npm start
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
