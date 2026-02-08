"""
MCP Server Template — Streamable HTTP with Okta OAuth (Resource Server)
Protocol version: 2025-11-25

An incident tracker MCP server secured with Okta using the Resource Server
pattern. The MCP server validates JWTs issued by Okta — it does NOT act as
an OAuth authorization server itself.

Flow:
  1. Client discovers Okta via /.well-known/oauth-protected-resource
  2. Client authenticates with Okta and gets a JWT
  3. Client sends JWT as Bearer token to this server
  4. Server validates the JWT (signature, issuer, audience, expiry)
  5. Server serves tools/resources/prompts

Run with:  uv run server.py
Server listens on http://127.0.0.1:9001/mcp
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP

from auth import OktaTokenVerifier

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
load_dotenv()

OKTA_DOMAIN = os.environ.get("OKTA_DOMAIN", "your-org.okta.com")
OKTA_AUDIENCE = os.environ.get("OKTA_AUDIENCE", "https://mcp-incidents-api")
OKTA_AUTH_SERVER_ID = os.environ.get("OKTA_AUTH_SERVER_ID", "default")

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 9001

# ---------------------------------------------------------------------------
# JSON "database" helpers
# ---------------------------------------------------------------------------
DB_PATH = Path(__file__).parent / "incidents.json"


def _load_incidents() -> dict[str, dict]:
    if not DB_PATH.exists():
        return {}
    return json.loads(DB_PATH.read_text())


def _save_incidents(incidents: dict[str, dict]) -> None:
    DB_PATH.write_text(json.dumps(incidents, indent=2))


def _next_id(incidents: dict[str, dict]) -> str:
    if not incidents:
        return "1"
    return str(max(int(k) for k in incidents) + 1)


# ---------------------------------------------------------------------------
# Okta token verifier + auth settings
# ---------------------------------------------------------------------------
token_verifier = OktaTokenVerifier(
    domain=OKTA_DOMAIN,
    audience=OKTA_AUDIENCE,
    auth_server_id=OKTA_AUTH_SERVER_ID,
)

auth_settings = AuthSettings(
    issuer_url=f"https://{OKTA_DOMAIN}/oauth2/{OKTA_AUTH_SERVER_ID}",
    resource_server_url=f"http://{SERVER_HOST}:{SERVER_PORT}/mcp",
)

# ---------------------------------------------------------------------------
# Server instance — Streamable HTTP with Okta OAuth
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "incidents",
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
def create_incident(
    title: str,
    severity: str = "medium",
    status: str = "open",
) -> str:
    """Create a new incident.

    Args:
        title: Incident title (e.g. "Database connection timeout")
        severity: Severity level — "low", "medium", "high", or "critical"
        status: Incident status — "open", "investigating", "resolved"
    """
    incidents = _load_incidents()
    new_id = _next_id(incidents)
    incidents[new_id] = {
        "id": new_id,
        "title": title,
        "severity": severity,
        "status": status,
    }
    _save_incidents(incidents)
    return (
        f"Incident '{title}' created with id {new_id} "
        f"(severity={severity}, status={status})."
    )


@mcp.tool()
def list_incidents(severity: str = "", status: str = "") -> str:
    """List incidents, optionally filtered by severity or status.

    Args:
        severity: Filter by severity ("low", "medium", "high", "critical"), or empty for all
        status: Filter by status ("open", "investigating", "resolved"), or empty for all
    """
    incidents = _load_incidents()
    if not incidents:
        return "No incidents found."

    items = list(incidents.values())
    if severity:
        items = [i for i in items if i["severity"] == severity]
    if status:
        items = [i for i in items if i["status"] == status]

    if not items:
        filters = []
        if severity:
            filters.append(f"severity='{severity}'")
        if status:
            filters.append(f"status='{status}'")
        return f"No incidents matching {', '.join(filters)}."

    lines = []
    for i in items:
        lines.append(
            f"- [{i['id']}] {i['title']} ({i['severity']}, {i['status']})"
        )
    return f"Found {len(lines)} incident(s):\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Resources — application-controlled data
# ---------------------------------------------------------------------------

@mcp.resource("incidents://all")
def all_incidents() -> str:
    """List all incidents."""
    incidents = _load_incidents()
    if not incidents:
        return "No incidents yet."
    lines = []
    for i in incidents.values():
        lines.append(
            f"[{i['id']}] {i['title']} — {i['severity']} ({i['status']})"
        )
    return "\n".join(lines)


@mcp.resource("incidents://{incident_id}")
def get_incident(incident_id: str) -> str:
    """Get details for a specific incident.

    Args:
        incident_id: The incident ID
    """
    incidents = _load_incidents()
    if incident_id not in incidents:
        return f"Incident '{incident_id}' not found."
    return json.dumps(incidents[incident_id], indent=2)


# ---------------------------------------------------------------------------
# Prompts — user-controlled templates
# ---------------------------------------------------------------------------

@mcp.prompt()
def triage_incidents(focus: str = "severity") -> str:
    """Generate a prompt to triage and analyze incidents.

    Args:
        focus: Triage focus — "severity" for severity-based prioritization,
               "patterns" for root-cause pattern analysis
    """
    incidents = _load_incidents()
    if not incidents:
        return "No incidents to triage."

    incidents_text = json.dumps(list(incidents.values()), indent=2)

    if focus == "patterns":
        instruction = (
            "Analyze these incidents for common patterns and root causes. "
            "Group related incidents, identify systemic issues, and suggest "
            "preventive measures to reduce future incidents."
        )
    else:
        instruction = (
            "Triage these incidents by severity and recommend an action plan. "
            "Identify which incidents need immediate attention, which can wait, "
            "and suggest an order of resolution with reasoning."
        )

    return f"{instruction}\n\nIncident data:\n{incidents_text}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
