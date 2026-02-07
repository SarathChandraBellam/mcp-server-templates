"""
MCP Server Template — stdio transport
Protocol version: 2025-11-25

A simple Notes server demonstrating all three MCP server features:
  - Tools:     add_note, search_notes
  - Resources: notes://list, notes://{name}
  - Prompts:   summarize_notes

Run with:  uv run server.py
"""

from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# Server instance
# ---------------------------------------------------------------------------
mcp = FastMCP("notes")

# ---------------------------------------------------------------------------
# In-memory notes storage
# ---------------------------------------------------------------------------
notes: dict[str, str] = {}

# ---------------------------------------------------------------------------
# Tools — model-controlled functions
# ---------------------------------------------------------------------------

@mcp.tool()
def add_note(name: str, content: str) -> str:
    """Add a new note or update an existing one.

    Args:
        name: Short identifier for the note (e.g. "meeting-2025-02-07")
        content: The text content of the note
    """
    notes[name] = content
    return f"Note '{name}' saved ({len(content)} chars)."


@mcp.tool()
def search_notes(query: str) -> str:
    """Search notes by keyword (case-insensitive substring match).

    Args:
        query: The search term to look for in note names and content
    """
    matches = []
    q = query.lower()
    for name, content in notes.items():
        if q in name.lower() or q in content.lower():
            preview = content[:120].replace("\n", " ")
            matches.append(f"- **{name}**: {preview}")

    if not matches:
        return f"No notes matching '{query}'."
    return f"Found {len(matches)} note(s):\n" + "\n".join(matches)


# ---------------------------------------------------------------------------
# Resources — application-controlled data
# ---------------------------------------------------------------------------

@mcp.resource("notes://list")
def list_notes() -> str:
    """List all stored notes."""
    if not notes:
        return "No notes stored yet."
    return "\n".join(f"- {name}" for name in sorted(notes))


@mcp.resource("notes://{name}")
def read_note(name: str) -> str:
    """Read the full content of a specific note.

    Args:
        name: The note identifier
    """
    if name not in notes:
        return f"Note '{name}' not found."
    return notes[name]


# ---------------------------------------------------------------------------
# Prompts — user-controlled templates
# ---------------------------------------------------------------------------

@mcp.prompt()
def summarize_notes(style: str = "brief") -> str:
    """Generate a prompt that asks the LLM to summarize all stored notes.

    Args:
        style: Summary style — "brief" for a short overview, "detailed" for
               an in-depth analysis
    """
    if not notes:
        return "There are no notes to summarize."

    notes_text = "\n\n".join(
        f"## {name}\n{content}" for name, content in notes.items()
    )

    if style == "detailed":
        instruction = (
            "Provide a detailed analysis of the following notes. "
            "Include key themes, action items, and connections between notes."
        )
    else:
        instruction = (
            "Provide a brief summary of the following notes in a few sentences."
        )

    return f"{instruction}\n\n{notes_text}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
