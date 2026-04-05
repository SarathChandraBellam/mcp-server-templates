/**
 * MCP Server Template — stdio transport
 * Protocol version: 2025-11-25
 *
 * Minimal calculator server exposing two tools:
 *   - add
 *   - sub
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
