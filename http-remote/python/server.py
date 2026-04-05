"""
MCP Server Template — remote Streamable HTTP transport
Protocol version: 2025-11-25

Minimal calculator server exposing two tools:
  - add
  - sub

Run with: uv run server.py
Server listens on http://127.0.0.1:8000/mcp
"""

from mcp.server.fastmcp import FastMCP


mcp = FastMCP(
    "calculator",
    host="127.0.0.1",
    port=8000,
    streamable_http_path="/mcp",
)


@mcp.tool()
def add(a: float, b: float) -> str:
    """Add two numbers."""
    result = a + b
    return f"{a} + {b} = {result}"


@mcp.tool()
def sub(a: float, b: float) -> str:
    """Subtract the second number from the first."""
    result = a - b
    return f"{a} - {b} = {result}"


def main() -> None:
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
