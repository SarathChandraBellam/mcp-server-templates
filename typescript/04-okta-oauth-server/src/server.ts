/**
 * MCP Server Template — Streamable HTTP with Okta OAuth (Resource Server)
 * Protocol version: 2025-11-25
 *
 * An incident tracker MCP server secured with Okta using the Resource Server
 * pattern. The MCP server validates JWTs issued by Okta — it does NOT act as
 * an OAuth authorization server itself.
 *
 * Flow:
 *   1. Client discovers Okta via /.well-known/oauth-protected-resource
 *   2. Client authenticates with Okta and gets a JWT
 *   3. Client sends JWT as Bearer token to this server
 *   4. Server validates the JWT (signature, issuer, audience, expiry)
 *   5. Server serves tools/resources/prompts
 *
 * Build & run:
 *   npm install && npm run build && npm start
 *
 * Server listens on http://127.0.0.1:9001/mcp
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";
import express from "express";
import { z } from "zod";

import { createOktaMiddleware } from "./auth.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "your-org.okta.com";
const OKTA_AUDIENCE = process.env.OKTA_AUDIENCE ?? "https://mcp-incidents-api";
const OKTA_AUTH_SERVER_ID = process.env.OKTA_AUTH_SERVER_ID ?? "default";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 9001;

// ---------------------------------------------------------------------------
// JSON "database" helpers
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "..", "incidents.json");

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
}

function loadIncidents(): Record<string, Incident> {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveIncidents(incidents: Record<string, Incident>): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(incidents, null, 2));
}

function nextId(incidents: Record<string, Incident>): string {
  const keys = Object.keys(incidents);
  if (keys.length === 0) return "1";
  return String(Math.max(...keys.map(Number)) + 1);
}

// ---------------------------------------------------------------------------
// MCP Server factory — one per session
// ---------------------------------------------------------------------------
function createServer(): McpServer {
  const server = new McpServer({
    name: "incidents",
    version: "1.0.0",
  });

  // -----------------------------------------------------------------------
  // Tools — model-controlled functions
  // -----------------------------------------------------------------------

  server.tool(
    "create_incident",
    "Create a new incident.",
    {
      title: z.string().describe('Incident title (e.g. "Database connection timeout")'),
      severity: z
        .enum(["low", "medium", "high", "critical"])
        .default("medium")
        .describe('Severity level — "low", "medium", "high", or "critical"'),
      status: z
        .enum(["open", "investigating", "resolved"])
        .default("open")
        .describe('Incident status — "open", "investigating", "resolved"'),
    },
    async ({ title, severity, status }) => {
      const incidents = loadIncidents();
      const newId = nextId(incidents);
      incidents[newId] = { id: newId, title, severity, status };
      saveIncidents(incidents);
      return {
        content: [
          { type: "text", text: `Incident '${title}' created with id ${newId} (severity=${severity}, status=${status}).` },
        ],
      };
    },
  );

  server.tool(
    "list_incidents",
    "List incidents, optionally filtered by severity or status.",
    {
      severity: z
        .enum(["low", "medium", "high", "critical", ""])
        .default("")
        .describe('Filter by severity ("low", "medium", "high", "critical"), or empty for all'),
      status: z
        .enum(["open", "investigating", "resolved", ""])
        .default("")
        .describe('Filter by status ("open", "investigating", "resolved"), or empty for all'),
    },
    async ({ severity, status }) => {
      const incidents = loadIncidents();
      let items = Object.values(incidents);

      if (!items.length) {
        return { content: [{ type: "text", text: "No incidents found." }] };
      }

      if (severity) {
        items = items.filter((i) => i.severity === severity);
      }
      if (status) {
        items = items.filter((i) => i.status === status);
      }

      if (!items.length) {
        const filters: string[] = [];
        if (severity) filters.push(`severity='${severity}'`);
        if (status) filters.push(`status='${status}'`);
        return { content: [{ type: "text", text: `No incidents matching ${filters.join(", ")}.` }] };
      }

      const lines = items.map((i) => `- [${i.id}] ${i.title} (${i.severity}, ${i.status})`);
      return {
        content: [{ type: "text", text: `Found ${lines.length} incident(s):\n${lines.join("\n")}` }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // Resources — application-controlled data
  // -----------------------------------------------------------------------

  server.resource(
    "all_incidents",
    "incidents://all",
    { description: "List all incidents." },
    async (uri) => {
      const incidents = loadIncidents();
      const entries = Object.values(incidents);
      const text = entries.length === 0
        ? "No incidents yet."
        : entries.map((i) => `[${i.id}] ${i.title} — ${i.severity} (${i.status})`).join("\n");

      return { contents: [{ uri: uri.href, text }] };
    },
  );

  server.resource(
    "get_incident",
    new ResourceTemplate("incidents://incidents/{incident_id}", { list: undefined }),
    { description: "Get details for a specific incident." },
    async (uri, variables) => {
      const incidents = loadIncidents();
      const iid = String(variables.incident_id);
      const text = incidents[iid]
        ? JSON.stringify(incidents[iid], null, 2)
        : `Incident '${iid}' not found.`;

      return { contents: [{ uri: uri.href, text }] };
    },
  );

  // -----------------------------------------------------------------------
  // Prompts — user-controlled templates
  // -----------------------------------------------------------------------

  server.prompt(
    "triage_incidents",
    "Generate a prompt to triage and analyze incidents.",
    {
      focus: z
        .enum(["severity", "patterns"])
        .default("severity")
        .describe('Triage focus — "severity" for severity-based prioritization, "patterns" for root-cause pattern analysis'),
    },
    async ({ focus }) => {
      const incidents = loadIncidents();
      const entries = Object.values(incidents);

      if (entries.length === 0) {
        return {
          messages: [{ role: "user", content: { type: "text", text: "No incidents to triage." } }],
        };
      }

      const incidentsText = JSON.stringify(entries, null, 2);

      const instruction =
        focus === "patterns"
          ? "Analyze these incidents for common patterns and root causes. Group related incidents, identify systemic issues, and suggest preventive measures to reduce future incidents."
          : "Triage these incidents by severity and recommend an action plan. Identify which incidents need immediate attention, which can wait, and suggest an order of resolution with reasoning.";

      return {
        messages: [{ role: "user", content: { type: "text", text: `${instruction}\n\nIncident data:\n${incidentsText}` } }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
const authMiddleware = createOktaMiddleware({
  domain: OKTA_DOMAIN,
  audience: OKTA_AUDIENCE,
  authServerId: OKTA_AUTH_SERVER_ID,
});

// ---------------------------------------------------------------------------
// Protected resource metadata (RFC 9728)
// ---------------------------------------------------------------------------
const resourceMetadata = {
  resource: `http://${SERVER_HOST}:${SERVER_PORT}/mcp`,
  authorization_servers: [`https://${OKTA_DOMAIN}/oauth2/${OKTA_AUTH_SERVER_ID}`],
};

// ---------------------------------------------------------------------------
// HTTP server with Streamable HTTP transport + Okta OAuth
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Discovery endpoint
app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.json(resourceMetadata);
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", authMiddleware, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) delete transports[sid];
    };

    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Bad Request: No valid session ID" },
    id: null,
  });
});

app.get("/mcp", authMiddleware, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.delete("/mcp", authMiddleware, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`Incidents MCP server (Okta OAuth) running on http://${SERVER_HOST}:${SERVER_PORT}/mcp`);
});
