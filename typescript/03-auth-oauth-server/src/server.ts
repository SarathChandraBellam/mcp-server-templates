/**
 * MCP Server Template — Streamable HTTP with Auth0 OAuth (Resource Server)
 * Protocol version: 2025-11-25
 *
 * A task manager MCP server secured with Auth0 using the Resource Server
 * pattern. The MCP server validates JWTs issued by Auth0 — it does NOT
 * act as an OAuth authorization server itself.
 *
 * Flow:
 *   1. Client discovers Auth0 via /.well-known/oauth-protected-resource
 *   2. Client authenticates with Auth0 and gets a JWT
 *   3. Client sends JWT as Bearer token to this server
 *   4. Server validates the JWT (signature, issuer, audience, expiry)
 *   5. Server serves tools/resources/prompts
 *
 * Build & run:
 *   npm install && npm run build && npm start
 *
 * Server listens on http://127.0.0.1:9000/mcp
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

import { createAuth0Middleware } from "./auth.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? "your-tenant.auth0.com";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? "https://mcp-tasks-api";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 9000;

// ---------------------------------------------------------------------------
// JSON "database" helpers
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "..", "tasks.json");

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
}

function loadTasks(): Record<string, Task> {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveTasks(tasks: Record<string, Task>): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(tasks, null, 2));
}

function nextId(tasks: Record<string, Task>): string {
  const keys = Object.keys(tasks);
  if (keys.length === 0) return "1";
  return String(Math.max(...keys.map(Number)) + 1);
}

// ---------------------------------------------------------------------------
// MCP Server factory — one per session
// ---------------------------------------------------------------------------
function createServer(): McpServer {
  const server = new McpServer({
    name: "tasks",
    version: "1.0.0",
  });

  // -----------------------------------------------------------------------
  // Tools — model-controlled functions
  // -----------------------------------------------------------------------

  server.tool(
    "create_task",
    "Create a new task.",
    {
      title: z.string().describe('Task title (e.g. "Fix login bug")'),
      status: z
        .enum(["todo", "in_progress", "done"])
        .default("todo")
        .describe('Task status — "todo", "in_progress", or "done"'),
      priority: z
        .enum(["low", "medium", "high"])
        .default("medium")
        .describe('Priority level — "low", "medium", or "high"'),
    },
    async ({ title, status, priority }) => {
      const tasks = loadTasks();
      const newId = nextId(tasks);
      tasks[newId] = { id: newId, title, status, priority };
      saveTasks(tasks);
      return {
        content: [
          { type: "text", text: `Task '${title}' created with id ${newId} (status=${status}, priority=${priority}).` },
        ],
      };
    },
  );

  server.tool(
    "list_tasks",
    "List tasks, optionally filtered by status.",
    {
      status: z
        .enum(["todo", "in_progress", "done", ""])
        .default("")
        .describe('Filter by status ("todo", "in_progress", "done"), or empty for all'),
    },
    async ({ status }) => {
      const tasks = loadTasks();
      let items = Object.values(tasks);

      if (!items.length) {
        return { content: [{ type: "text", text: "No tasks found." }] };
      }

      if (status) {
        items = items.filter((t) => t.status === status);
      }

      if (!items.length) {
        return { content: [{ type: "text", text: `No tasks with status '${status}'.` }] };
      }

      const lines = items.map((t) => `- [${t.id}] ${t.title} (${t.status}, ${t.priority})`);
      return {
        content: [{ type: "text", text: `Found ${lines.length} task(s):\n${lines.join("\n")}` }],
      };
    },
  );

  // -----------------------------------------------------------------------
  // Resources — application-controlled data
  // -----------------------------------------------------------------------

  server.resource(
    "all_tasks",
    "tasks://all",
    { description: "List all tasks." },
    async (uri) => {
      const tasks = loadTasks();
      const entries = Object.values(tasks);
      const text = entries.length === 0
        ? "No tasks yet."
        : entries.map((t) => `[${t.id}] ${t.title} — ${t.status} (${t.priority})`).join("\n");

      return { contents: [{ uri: uri.href, text }] };
    },
  );

  server.resource(
    "get_task",
    new ResourceTemplate("tasks://tasks/{task_id}", { list: undefined }),
    { description: "Get details for a specific task." },
    async (uri, variables) => {
      const tasks = loadTasks();
      const tid = String(variables.task_id);
      const text = tasks[tid]
        ? JSON.stringify(tasks[tid], null, 2)
        : `Task '${tid}' not found.`;

      return { contents: [{ uri: uri.href, text }] };
    },
  );

  // -----------------------------------------------------------------------
  // Prompts — user-controlled templates
  // -----------------------------------------------------------------------

  server.prompt(
    "prioritize_tasks",
    "Generate a prompt to prioritize tasks.",
    {
      focus: z
        .enum(["urgency", "impact"])
        .default("urgency")
        .describe('Prioritization focus — "urgency" for deadline-driven, "impact" for value-driven analysis'),
    },
    async ({ focus }) => {
      const tasks = loadTasks();
      const entries = Object.values(tasks);

      if (entries.length === 0) {
        return {
          messages: [{ role: "user", content: { type: "text", text: "No tasks to prioritize." } }],
        };
      }

      const tasksText = JSON.stringify(entries, null, 2);

      const instruction =
        focus === "impact"
          ? "Analyze these tasks and prioritize them by business impact. Consider which tasks deliver the most value, unblock other work, or reduce technical debt. Suggest a ranked order with reasoning."
          : "Analyze these tasks and prioritize them by urgency. Consider current status, priority level, and dependencies. Suggest which tasks to tackle first and why.";

      return {
        messages: [{ role: "user", content: { type: "text", text: `${instruction}\n\nTask data:\n${tasksText}` } }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
const authMiddleware = createAuth0Middleware({
  domain: AUTH0_DOMAIN,
  audience: AUTH0_AUDIENCE,
});

// ---------------------------------------------------------------------------
// Protected resource metadata (RFC 9728)
// ---------------------------------------------------------------------------
const resourceMetadata = {
  resource: `http://${SERVER_HOST}:${SERVER_PORT}/mcp`,
  authorization_servers: [`https://${AUTH0_DOMAIN}/`],
};

// ---------------------------------------------------------------------------
// HTTP server with Streamable HTTP transport + Auth0 OAuth
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
  console.log(`Tasks MCP server (Auth0 OAuth) running on http://${SERVER_HOST}:${SERVER_PORT}/mcp`);
});
