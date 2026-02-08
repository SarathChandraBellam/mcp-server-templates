/**
 * MCP Server Template — Streamable HTTP transport
 * Protocol version: 2025-11-25
 *
 * A product catalog server backed by a JSON file, demonstrating all three
 * MCP server features over Streamable HTTP:
 *   - Tools:     add_product, search_products
 *   - Resources: products://all, products://{id}
 *   - Prompts:   analyze_catalog
 *
 * Build & run:
 *   npm install && npm run build && npm start
 *
 * Server listens on http://127.0.0.1:8000/mcp
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// JSON "database" helpers
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "..", "products.json");

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

function loadProducts(): Record<string, Product> {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveProducts(products: Record<string, Product>): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(products, null, 2));
}

function nextId(products: Record<string, Product>): string {
  const keys = Object.keys(products);
  if (keys.length === 0) return "1";
  return String(Math.max(...keys.map(Number)) + 1);
}

// ---------------------------------------------------------------------------
// MCP Server factory — one per session
// ---------------------------------------------------------------------------
function createServer(): McpServer {
  const server = new McpServer({
    name: "products",
    version: "1.0.0",
  });

  // -----------------------------------------------------------------------
  // Tools — model-controlled functions
  // -----------------------------------------------------------------------

  server.tool(
    "add_product",
    "Add a new product to the catalog.",
    {
      name: z.string().describe('Product name (e.g. "Wireless Mouse")'),
      price: z.number().describe("Price in USD (e.g. 29.99)"),
      category: z.string().describe('Product category (e.g. "electronics", "furniture")'),
    },
    async ({ name, price, category }) => {
      const products = loadProducts();
      const newId = nextId(products);
      products[newId] = { id: newId, name, price, category };
      saveProducts(products);
      return {
        content: [{ type: "text", text: `Product '${name}' added with id ${newId} ($${price.toFixed(2)}, ${category}).` }],
      };
    },
  );

  server.tool(
    "search_products",
    "Search products by name or category (case-insensitive).",
    {
      query: z.string().describe("Search term to match against product name or category"),
    },
    async ({ query }) => {
      const products = loadProducts();
      const q = query.toLowerCase();
      const matches: string[] = [];

      for (const [pid, p] of Object.entries(products)) {
        if (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) {
          matches.push(`- [${pid}] ${p.name} — $${p.price.toFixed(2)} (${p.category})`);
        }
      }

      const text = matches.length === 0
        ? `No products matching '${query}'.`
        : `Found ${matches.length} product(s):\n${matches.join("\n")}`;

      return { content: [{ type: "text", text }] };
    },
  );

  // -----------------------------------------------------------------------
  // Resources — application-controlled data
  // -----------------------------------------------------------------------

  server.resource(
    "list_products",
    "products://all",
    { description: "List all products in the catalog." },
    async (uri) => {
      const products = loadProducts();
      const entries = Object.values(products);
      const text = entries.length === 0
        ? "Catalog is empty."
        : entries.map((p) => `[${p.id}] ${p.name} — $${p.price.toFixed(2)} (${p.category})`).join("\n");

      return { contents: [{ uri: uri.href, text }] };
    },
  );

  server.resource(
    "get_product",
    new ResourceTemplate("products://products/{product_id}", { list: undefined }),
    { description: "Get details for a specific product." },
    async (uri, variables) => {
      const products = loadProducts();
      const pid = String(variables.product_id);
      const text = products[pid]
        ? JSON.stringify(products[pid], null, 2)
        : `Product '${pid}' not found.`;

      return { contents: [{ uri: uri.href, text }] };
    },
  );

  // -----------------------------------------------------------------------
  // Prompts — user-controlled templates
  // -----------------------------------------------------------------------

  server.prompt(
    "analyze_catalog",
    "Generate a prompt to analyze the product catalog.",
    {
      focus: z
        .enum(["pricing", "inventory"])
        .default("pricing")
        .describe('Analysis focus — "pricing" for price analysis, "inventory" for category/stock overview'),
    },
    async ({ focus }) => {
      const products = loadProducts();
      const entries = Object.values(products);

      if (entries.length === 0) {
        return {
          messages: [{ role: "user", content: { type: "text", text: "The catalog is empty — nothing to analyze." } }],
        };
      }

      const catalogText = JSON.stringify(entries, null, 2);

      const instruction =
        focus === "inventory"
          ? "Analyze this product catalog focusing on inventory composition. Break down products by category, identify gaps, and suggest categories that could be added."
          : "Analyze the pricing of this product catalog. Identify the price range, suggest competitive adjustments, and flag any outliers.";

      return {
        messages: [{ role: "user", content: { type: "text", text: `${instruction}\n\nCatalog data:\n${catalogText}` } }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// HTTP server with Streamable HTTP transport
// ---------------------------------------------------------------------------
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

const PORT = 8000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Products MCP server running on http://127.0.0.1:${PORT}/mcp`);
});
