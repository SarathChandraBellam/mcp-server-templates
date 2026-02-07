"""
MCP Server Template — Streamable HTTP with Auth0 OAuth (Resource Server)
Protocol version: 2025-11-25

A task manager MCP server secured with Auth0 using the Resource Server
pattern. The MCP server validates JWTs issued by Auth0 — it does NOT
act as an OAuth authorization server itself.

Flow:
  1. Client discovers Auth0 via /.well-known/oauth-protected-resource
  2. Client authenticates with Auth0 and gets a JWT
  3. Client sends JWT as Bearer token to this server
  4. Server validates the JWT (signature, issuer, audience, expiry)
  5. Server serves tools/resources/prompts

Run with:  uv run server.py
Server listens on http://127.0.0.1:9000/mcp
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP

from auth import Auth0TokenVerifier

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "your-tenant.auth0.com")
AUTH0_AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "https://mcp-tasks-api")

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 9000

# ---------------------------------------------------------------------------
# JSON "database" helpers
# ---------------------------------------------------------------------------
DB_PATH = Path(__file__).parent / "tasks.json"


def _load_tasks() -> dict[str, dict]:
    if not DB_PATH.exists():
        return {}
    return json.loads(DB_PATH.read_text())


def _save_tasks(tasks: dict[str, dict]) -> None:
    DB_PATH.write_text(json.dumps(tasks, indent=2))


def _next_id(tasks: dict[str, dict]) -> str:
    if not tasks:
        return "1"
    return str(max(int(k) for k in tasks) + 1)


# ---------------------------------------------------------------------------
# Auth0 token verifier + auth settings
# ---------------------------------------------------------------------------
token_verifier = Auth0TokenVerifier(
    domain=AUTH0_DOMAIN,
    audience=AUTH0_AUDIENCE,
)

auth_settings = AuthSettings(
    issuer_url=f"https://{AUTH0_DOMAIN}/",
    resource_server_url=f"http://{SERVER_HOST}:{SERVER_PORT}/mcp",
)

# ---------------------------------------------------------------------------
# Server instance — Streamable HTTP with Auth0 OAuth
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "tasks",
    host=SERVER_HOST,
    port=SERVER_PORT,
    streamable_http_path="/mcp",
    token_verifier=token_verifier,
    auth=auth_settings,
)


# ---------------------------------------------------------------------------
# Tools — model-controlled functions
# ---------------------------------------------------------------------------

@mcp.tool()
def create_task(title: str, status: str = "todo", priority: str = "medium") -> str:
    """Create a new task.

    Args:
        title: Task title (e.g. "Fix login bug")
        status: Task status — "todo", "in_progress", or "done"
        priority: Priority level — "low", "medium", or "high"
    """
    tasks = _load_tasks()
    new_id = _next_id(tasks)
    tasks[new_id] = {
        "id": new_id,
        "title": title,
        "status": status,
        "priority": priority,
    }
    _save_tasks(tasks)
    return f"Task '{title}' created with id {new_id} (status={status}, priority={priority})."


@mcp.tool()
def list_tasks(status: str = "") -> str:
    """List tasks, optionally filtered by status.

    Args:
        status: Filter by status ("todo", "in_progress", "done"), or empty for all
    """
    tasks = _load_tasks()
    if not tasks:
        return "No tasks found."

    items = tasks.values()
    if status:
        items = [t for t in items if t["status"] == status]

    if not items:
        return f"No tasks with status '{status}'."

    lines = []
    for t in items:
        lines.append(f"- [{t['id']}] {t['title']} ({t['status']}, {t['priority']})")
    return f"Found {len(lines)} task(s):\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Resources — application-controlled data
# ---------------------------------------------------------------------------

@mcp.resource("tasks://all")
def all_tasks() -> str:
    """List all tasks."""
    tasks = _load_tasks()
    if not tasks:
        return "No tasks yet."
    lines = []
    for t in tasks.values():
        lines.append(f"[{t['id']}] {t['title']} — {t['status']} ({t['priority']})")
    return "\n".join(lines)


@mcp.resource("tasks://{task_id}")
def get_task(task_id: str) -> str:
    """Get details for a specific task.

    Args:
        task_id: The task ID
    """
    tasks = _load_tasks()
    if task_id not in tasks:
        return f"Task '{task_id}' not found."
    return json.dumps(tasks[task_id], indent=2)


# ---------------------------------------------------------------------------
# Prompts — user-controlled templates
# ---------------------------------------------------------------------------

@mcp.prompt()
def prioritize_tasks(focus: str = "urgency") -> str:
    """Generate a prompt to prioritize tasks.

    Args:
        focus: Prioritization focus — "urgency" for deadline-driven,
               "impact" for value-driven analysis
    """
    tasks = _load_tasks()
    if not tasks:
        return "No tasks to prioritize."

    tasks_text = json.dumps(list(tasks.values()), indent=2)

    if focus == "impact":
        instruction = (
            "Analyze these tasks and prioritize them by business impact. "
            "Consider which tasks deliver the most value, unblock other work, "
            "or reduce technical debt. Suggest a ranked order with reasoning."
        )
    else:
        instruction = (
            "Analyze these tasks and prioritize them by urgency. "
            "Consider current status, priority level, and dependencies. "
            "Suggest which tasks to tackle first and why."
        )

    return f"{instruction}\n\nTask data:\n{tasks_text}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
