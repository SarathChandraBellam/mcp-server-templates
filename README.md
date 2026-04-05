# MCP Server Templates

Minimal, transport-first [Model Context Protocol](https://modelcontextprotocol.io) server templates following the **2025-11-25** specification.

This repo now focuses on the smallest useful MCP example:

- `add(a, b)`
- `sub(a, b)`

## Layout

| Transport | Python | TypeScript | Notes |
|---|---|---|---|
| `stdio` | [stdio/python](stdio/python/) | [stdio/typescript](stdio/typescript/) | Local subprocess server over stdin/stdout |
| `http-remote` | [http-remote/python](http-remote/python/) | [http-remote/typescript](http-remote/typescript/) | Remote Streamable HTTP server at `/mcp` |

## Scope

These templates intentionally demonstrate:

- Transport setup
- Tool registration
- Typed tool inputs
- Minimal request/response flow

These templates do not currently include:

- Resources
- Prompts
- OAuth examples
- Persistence or sample data files

## Prerequisites

### Python

- Python 3.10+
- [uv](https://docs.astral.sh/uv/)

### TypeScript

- Node.js 18+
- npm

## Quick Start

### Python stdio

```bash
cd stdio/python
uv sync
uv run server.py
```

### TypeScript stdio

```bash
cd stdio/typescript
npm install
npm run build
npm start
```

### Python http-remote

```bash
cd http-remote/python
uv sync
uv run server.py
```

### TypeScript http-remote

```bash
cd http-remote/typescript
npm install
npm run build
npm start
```

Remote HTTP templates listen on `http://127.0.0.1:8000/mcp`.

## Project Structure

```text
mcp-server-templates/
├── README.md
├── docs/
│   ├── mcp-oauth-guide.md
│   └── mcp-primitives-guide.md
├── stdio/
│   ├── python/
│   └── typescript/
└── http-remote/
    ├── python/
    └── typescript/
```


## License

MIT
