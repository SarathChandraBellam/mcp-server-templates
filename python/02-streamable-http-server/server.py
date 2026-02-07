"""
MCP Server Template — Streamable HTTP transport
Protocol version: 2025-11-25

A product catalog server backed by a JSON file, demonstrating all three
MCP server features over Streamable HTTP:
  - Tools:     add_product, search_products
  - Resources: products://all, products://{id}
  - Prompts:   analyze_catalog

Run with:  uv run server.py
Server listens on http://127.0.0.1:8000/mcp
"""

import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# JSON "database" helpers
# ---------------------------------------------------------------------------
DB_PATH = Path(__file__).parent / "products.json"


def _load_products() -> dict[str, dict]:
    if not DB_PATH.exists():
        return {}
    return json.loads(DB_PATH.read_text())


def _save_products(products: dict[str, dict]) -> None:
    DB_PATH.write_text(json.dumps(products, indent=2))


def _next_id(products: dict[str, dict]) -> str:
    if not products:
        return "1"
    return str(max(int(k) for k in products) + 1)


# ---------------------------------------------------------------------------
# Server instance — Streamable HTTP, no auth
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "products",
    host="127.0.0.1",
    port=8000,
    streamable_http_path="/mcp",
)

# ---------------------------------------------------------------------------
# Tools — model-controlled functions
# ---------------------------------------------------------------------------

@mcp.tool()
def add_product(name: str, price: float, category: str) -> str:
    """Add a new product to the catalog.

    Args:
        name: Product name (e.g. "Wireless Mouse")
        price: Price in USD (e.g. 29.99)
        category: Product category (e.g. "electronics", "furniture")
    """
    products = _load_products()
    new_id = _next_id(products)
    products[new_id] = {
        "id": new_id,
        "name": name,
        "price": price,
        "category": category,
    }
    _save_products(products)
    return f"Product '{name}' added with id {new_id} (${price:.2f}, {category})."


@mcp.tool()
def search_products(query: str) -> str:
    """Search products by name or category (case-insensitive).

    Args:
        query: Search term to match against product name or category
    """
    products = _load_products()
    q = query.lower()
    matches = []
    for pid, p in products.items():
        if q in p["name"].lower() or q in p["category"].lower():
            matches.append(f"- [{pid}] {p['name']} — ${p['price']:.2f} ({p['category']})")

    if not matches:
        return f"No products matching '{query}'."
    return f"Found {len(matches)} product(s):\n" + "\n".join(matches)


# ---------------------------------------------------------------------------
# Resources — application-controlled data
# ---------------------------------------------------------------------------

@mcp.resource("products://all")
def list_products() -> str:
    """List all products in the catalog."""
    products = _load_products()
    if not products:
        return "Catalog is empty."
    lines = []
    for pid, p in products.items():
        lines.append(f"[{pid}] {p['name']} — ${p['price']:.2f} ({p['category']})")
    return "\n".join(lines)


@mcp.resource("products://{product_id}")
def get_product(product_id: str) -> str:
    """Get details for a specific product.

    Args:
        product_id: The product ID
    """
    products = _load_products()
    if product_id not in products:
        return f"Product '{product_id}' not found."
    p = products[product_id]
    return json.dumps(p, indent=2)


# ---------------------------------------------------------------------------
# Prompts — user-controlled templates
# ---------------------------------------------------------------------------

@mcp.prompt()
def analyze_catalog(focus: str = "pricing") -> str:
    """Generate a prompt to analyze the product catalog.

    Args:
        focus: Analysis focus — "pricing" for price analysis, "inventory"
               for category/stock overview
    """
    products = _load_products()
    if not products:
        return "The catalog is empty — nothing to analyze."

    catalog_text = json.dumps(list(products.values()), indent=2)

    if focus == "inventory":
        instruction = (
            "Analyze this product catalog focusing on inventory composition. "
            "Break down products by category, identify gaps, and suggest "
            "categories that could be added."
        )
    else:
        instruction = (
            "Analyze the pricing of this product catalog. "
            "Identify the price range, suggest competitive adjustments, "
            "and flag any outliers."
        )

    return f"{instruction}\n\nCatalog data:\n{catalog_text}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
