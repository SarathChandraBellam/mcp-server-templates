# MCP Server Template — TypeScript / stdio

Minimal calculator MCP server using **stdio** transport and the TypeScript MCP SDK.

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

## MCP Configuration

```json
{
  "mcpServers": {
    "calculator": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/stdio/typescript/dist/server.js"
      ]
    }
  }
}
```
