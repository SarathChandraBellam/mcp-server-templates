/**
 * MCP Server Template — remote Streamable HTTP transport
 * Protocol version: 2025-11-25
 *
 * Minimal calculator server exposing two tools:
 *   - add
 *   - sub
 *
 * Server listens on http://127.0.0.1:8000/mcp
 */

import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod";

function createServer(): McpServer {
  const server = new McpServer({
    name: "calculator",
    version: "1.0.0",
  });

  server.tool(
    "add",
    "Add two numbers.",
    {
      a: z.number().describe("The first number"),
      b: z.number().describe("The second number"),
    },
    async ({ a, b }) => ({
      content: [{ type: "text", text: `${a} + ${b} = ${a + b}` }],
    }),
  );

  server.tool(
    "sub",
    "Subtract the second number from the first.",
    {
      a: z.number().describe("The first number"),
      b: z.number().describe("The second number"),
    },
    async ({ a, b }) => ({
      content: [{ type: "text", text: `${a} - ${b} = ${a - b}` }],
    }),
  );

  return server;
}

const app = express();
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
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
      if (sid) {
        delete transports[sid];
      }
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

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

const port = 8000;
app.listen(port, "127.0.0.1", () => {
  console.log(`Calculator MCP server running on http://127.0.0.1:${port}/mcp`);
});
