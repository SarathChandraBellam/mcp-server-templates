"""
MCP Server Template — stdio transport
Protocol version: 2025-11-25

Minimal calculator server exposing two tools:
  - add
  - sub

Run with: uv run server.py
"""

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("calculator")


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
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
