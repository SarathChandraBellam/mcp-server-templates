/**
 * MCP Server Template — stdio transport
 * Protocol version: 2025-11-25
 *
 * A simple Notes server demonstrating all three MCP server features:
 *   - Tools:     add_note, search_notes
 *   - Resources: notes://list, notes://{name}
 *   - Prompts:   summarize_notes
 *
 * Build & run:
 *   npm install && npm run build && npm start
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Server instance
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "notes",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// In-memory notes storage
// ---------------------------------------------------------------------------
const notes: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Tools — model-controlled functions
// ---------------------------------------------------------------------------

server.tool(
  "add_note",
  "Add a new note or update an existing one.",
  {
    name: z.string().describe('Short identifier for the note (e.g. "meeting-2025-02-07")'),
    content: z.string().describe("The text content of the note"),
  },
  async ({ name, content }) => {
    notes[name] = content;
    return {
      content: [{ type: "text", text: `Note '${name}' saved (${content.length} chars).` }],
    };
  },
);

server.tool(
  "search_notes",
  "Search notes by keyword (case-insensitive substring match).",
  {
    query: z.string().describe("The search term to look for in note names and content"),
  },
  async ({ query }) => {
    const matches: string[] = [];
    const q = query.toLowerCase();

    for (const [name, content] of Object.entries(notes)) {
      if (name.toLowerCase().includes(q) || content.toLowerCase().includes(q)) {
        const preview = content.slice(0, 120).replace(/\n/g, " ");
        matches.push(`- **${name}**: ${preview}`);
      }
    }

    const text = matches.length === 0
      ? `No notes matching '${query}'.`
      : `Found ${matches.length} note(s):\n${matches.join("\n")}`;

    return { content: [{ type: "text", text }] };
  },
);

// ---------------------------------------------------------------------------
// Resources — application-controlled data
// ---------------------------------------------------------------------------

server.resource(
  "list_notes",
  "notes://list",
  { description: "List all stored notes." },
  async (uri) => {
    const text = Object.keys(notes).length === 0
      ? "No notes stored yet."
      : Object.keys(notes).sort().map((n) => `- ${n}`).join("\n");

    return { contents: [{ uri: uri.href, text }] };
  },
);

server.resource(
  "read_note",
  new ResourceTemplate("notes://notes/{name}", { list: undefined }),
  { description: "Read the full content of a specific note." },
  async (uri, variables) => {
    const name = String(variables.name);
    const text = notes[name] !== undefined
      ? notes[name]
      : `Note '${name}' not found.`;

    return { contents: [{ uri: uri.href, text }] };
  },
);

// ---------------------------------------------------------------------------
// Prompts — user-controlled templates
// ---------------------------------------------------------------------------

server.prompt(
  "summarize_notes",
  "Generate a prompt that asks the LLM to summarize all stored notes.",
  {
    style: z
      .enum(["brief", "detailed"])
      .default("brief")
      .describe('Summary style — "brief" for a short overview, "detailed" for an in-depth analysis'),
  },
  async ({ style }) => {
    if (Object.keys(notes).length === 0) {
      return {
        messages: [{ role: "user", content: { type: "text", text: "There are no notes to summarize." } }],
      };
    }

    const notesText = Object.entries(notes)
      .map(([name, content]) => `## ${name}\n${content}`)
      .join("\n\n");

    const instruction =
      style === "detailed"
        ? "Provide a detailed analysis of the following notes. Include key themes, action items, and connections between notes."
        : "Provide a brief summary of the following notes in a few sentences.";

    return {
      messages: [{ role: "user", content: { type: "text", text: `${instruction}\n\n${notesText}` } }],
    };
  },
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
