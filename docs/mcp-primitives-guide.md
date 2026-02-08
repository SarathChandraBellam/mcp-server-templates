# MCP Primitives Guide: Tools, Resources, and Prompts

A practical guide to the three MCP server primitives — what they are, how they differ, who controls them, and when to use each one.

## Table of Contents

- [The Three Primitives at a Glance](#the-three-primitives-at-a-glance)
- [Tools — Model-Controlled Functions](#tools--model-controlled-functions)
- [Resources — Application-Controlled Data](#resources--application-controlled-data)
- [Prompts — User-Controlled Templates](#prompts--user-controlled-templates)
- [Prompts vs Skills: What's the Difference?](#prompts-vs-skills-whats-the-difference)
- [End-to-End Use Cases](#end-to-end-use-cases)
- [Decision Guide: Which Primitive to Use](#decision-guide-which-primitive-to-use)
- [Combining Primitives](#combining-primitives)

---

## The Three Primitives at a Glance

MCP servers expose capabilities through three distinct primitives. Each has a different **control model** — who decides when and how it's used.

| Primitive | Controlled By | Purpose | Analogy |
|-----------|--------------|---------|---------|
| **Tools** | Model (LLM) | Execute actions and computations | Functions the AI can call |
| **Resources** | Application (host) | Provide data and context | Files the app can read |
| **Prompts** | User (human) | Structured templates for common workflows | Slash commands the user can invoke |

```
                    ┌─────────────────────────────┐
                    │         MCP Server           │
                    │                               │
  Model decides ──> │  Tools      (execute actions) │
                    │                               │
  App decides ────> │  Resources  (provide data)    │
                    │                               │
  User decides ───> │  Prompts    (templates)       │
                    └─────────────────────────────┘
```

The control model is the key distinction. It determines **who triggers** the primitive and **when** it runs.

---

## Tools — Model-Controlled Functions

**What:** Functions that the LLM can decide to call during a conversation. The model reads the tool's name, description, and parameter schema, then chooses whether and when to invoke it.

**Control:** The **model** decides when to call tools based on the conversation context. The user doesn't explicitly trigger them — the AI reasons about when a tool is needed.

**Characteristics:**
- Have typed input parameters (JSON Schema)
- Return a result string to the model
- Can have side effects (create files, send emails, write to databases)
- Discovered via `tools/list`, called via `tools/call`

### Tool Use Cases

| Use Case | Tool | Why a Tool? |
|----------|------|-------------|
| **Create data** | `create_task(title, priority)` | Side effect — writes to database |
| **Search** | `search_products(query)` | Model decides when search is needed based on user's question |
| **Compute** | `calculate_shipping(weight, zip)` | Model needs to perform a calculation it can't do natively |
| **External API** | `send_slack_message(channel, text)` | Action with side effects on external system |
| **File operations** | `write_file(path, content)` | Modifies the filesystem |
| **Query** | `run_sql(query)` | Executes a database query based on what the user is asking |

### Example

```python
@mcp.tool()
def create_task(title: str, priority: str = "medium") -> str:
    """Create a new task in the project tracker.

    Args:
        title: Task title (e.g. "Fix login bug")
        priority: Priority level — "low", "medium", or "high"
    """
    # The MODEL decides when to call this based on conversation
    # e.g., user says "add a task to fix the login bug"
    tasks[next_id()] = {"title": title, "priority": priority}
    return f"Task '{title}' created."
```

### When NOT to Use Tools

- **Static data retrieval** → Use Resources instead (the app can pre-load data without waiting for the model to decide)
- **User-initiated workflows** → Use Prompts instead (the user should explicitly choose to start the workflow)
- **Context injection** → Use Resources (data that should always be available, not called on-demand)

---

## Resources — Application-Controlled Data

**What:** Data sources identified by URIs that provide context to the LLM. Resources are read-only — they expose data but don't perform actions.

**Control:** The **application** (host) decides which resources to load into the conversation context. The host may auto-attach resources, let the user browse them, or use them to populate the model's context window.

**Characteristics:**
- Identified by URI (e.g., `notes://list`, `tasks://{id}`)
- Read-only — no side effects
- Can be static (fixed URI) or templated (parameterized URI)
- Discovered via `resources/list`, read via `resources/read`
- Can support subscriptions for live updates

### Resource Use Cases

| Use Case | Resource URI | Why a Resource? |
|----------|-------------|-----------------|
| **Project context** | `project://readme` | App auto-attaches README to every conversation |
| **Data listing** | `products://all` | App shows all products as background context |
| **Single record** | `tasks://{task_id}` | App loads a specific task the user is discussing |
| **Configuration** | `config://settings` | App provides current settings as context |
| **Log data** | `logs://recent` | App attaches recent logs for debugging conversations |
| **Schema info** | `database://schema` | App provides DB schema so the model can write correct SQL |

### Example

```python
@mcp.resource("tasks://all")
def all_tasks() -> str:
    """List all tasks — available as background context."""
    # The APPLICATION decides to load this, not the model
    # e.g., the host attaches all tasks when the user opens the task view
    return format_tasks(load_tasks())


@mcp.resource("tasks://{task_id}")
def get_task(task_id: str) -> str:
    """Get a specific task — loaded when user selects a task."""
    return json.dumps(tasks[task_id], indent=2)
```

### When NOT to Use Resources

- **Actions with side effects** → Use Tools (resources are read-only)
- **Model-driven data fetching** → Use Tools if the model should decide when to fetch data
- **User-initiated workflows** → Use Prompts instead

---

## Prompts — User-Controlled Templates

**What:** Structured message templates that define reusable workflows. Prompts generate pre-built messages (with optional arguments) that guide the LLM toward a specific task.

**Control:** The **user** explicitly selects a prompt to invoke. The host application typically surfaces prompts as slash commands, menu items, or buttons. The user chooses when to use them — the model doesn't auto-invoke prompts.

**Characteristics:**
- User-initiated (shown as commands or menu options)
- Accept optional arguments (e.g., `focus: "pricing"`)
- Return structured messages (system, user, or assistant role)
- Can include dynamic data (load from resources/database)
- Discovered via `prompts/list`, invoked via `prompts/get`

### Prompt Use Cases

| Use Case | Prompt | Why a Prompt? |
|----------|--------|---------------|
| **Analysis template** | `analyze_catalog(focus)` | User wants to trigger a specific analysis workflow |
| **Code review** | `review_code(style)` | User explicitly asks for a review with a chosen style |
| **Summarization** | `summarize_notes(style)` | User picks when to summarize and how detailed |
| **Report generation** | `weekly_report(team)` | User triggers a weekly report for a specific team |
| **Triage workflow** | `triage_incidents(focus)` | User initiates incident triage with a focus area |
| **Onboarding** | `explain_codebase(depth)` | User asks for codebase explanation at chosen depth |

### Example

```python
@mcp.prompt()
def triage_incidents(focus: str = "severity") -> str:
    """Generate a prompt to triage incidents.

    Args:
        focus: "severity" for priority-based, "patterns" for root-cause analysis
    """
    # The USER explicitly triggers this — e.g., via a slash command
    # The prompt loads current data and builds an instruction
    incidents = load_incidents()
    if focus == "patterns":
        instruction = "Analyze these incidents for common patterns..."
    else:
        instruction = "Triage these incidents by severity..."
    return f"{instruction}\n\n{json.dumps(incidents)}"
```

### When NOT to Use Prompts

- **Model-driven actions** → Use Tools (the model should decide, not the user)
- **Static data exposure** → Use Resources (no user trigger needed)
- **Simple data retrieval** → Use Resources (prompts are for workflows, not data)

---

## Prompts vs Skills: What's the Difference?

This is a common source of confusion. **Prompts** and **skills** (sometimes called "slash commands") serve different purposes and live at different layers.

### MCP Prompts (Server-Side)

MCP Prompts are a **protocol primitive** defined in the MCP specification. They are:

- **Defined by the MCP server** — the server author writes them
- **Discovered via MCP protocol** — clients call `prompts/list` to find them
- **Parameterized templates** — they accept arguments and return structured messages
- **Data-aware** — they can load live data from the server's data store
- **Cross-client** — any MCP client can discover and use them
- **Stateless** — they generate a message template, they don't maintain conversation state

```
MCP Server defines:
  prompt "triage_incidents" (focus: str)
    → Loads incidents from DB
    → Returns: "Triage these incidents by {focus}... [incident data]"

Any MCP client can discover and invoke this prompt.
```

### Skills / Slash Commands (Client-Side)

Skills are a **client-side concept** implemented by specific host applications (Claude Desktop, VS Code extensions, custom clients). They are:

- **Defined by the client application** — the app developer builds them
- **Not part of MCP protocol** — they're a UI/UX pattern, not a protocol feature
- **Client-specific** — a skill in Claude Desktop doesn't exist in other clients
- **Can orchestrate multiple steps** — call tools, read resources, chain actions
- **Stateful** — can maintain context across multiple interactions
- **Often invoke MCP primitives** — a skill might call tools, load resources, and use prompts under the hood

```
Claude Desktop defines:
  /review-pr
    → Fetches PR diff (tool call to GitHub MCP server)
    → Loads coding standards (resource from company MCP server)
    → Applies review prompt (prompt from code review MCP server)
    → Presents findings to user

This skill only exists in Claude Desktop.
```

### Side-by-Side Comparison

| Aspect | MCP Prompts | Skills / Slash Commands |
|--------|-------------|----------------------|
| **Defined by** | MCP server author | Client app developer |
| **Lives in** | MCP server | Client application |
| **Protocol** | MCP (`prompts/list`, `prompts/get`) | Not standardized |
| **Discovery** | Any MCP client can discover | Only the client that defines it |
| **Portability** | Works across all MCP clients | Tied to one client |
| **Data access** | Server's own data store | Can access multiple MCP servers |
| **Complexity** | Single template with arguments | Can orchestrate multi-step workflows |
| **State** | Stateless (generates a message) | Can be stateful |
| **Example** | `summarize_notes(style="brief")` | `/deploy staging` |

### How They Work Together

Skills often **use** MCP prompts as building blocks:

```
User types: /weekly-standup

Client-side skill orchestrates:
  1. resources/read  → "tasks://all" from Task MCP server
  2. resources/read  → "commits://week" from Git MCP server
  3. prompts/get     → "summarize_progress(period=week)" from Reports MCP server
  4. Combines everything into a standup report
```

The skill is the user-facing command. The prompt is one of the server-side primitives the skill leverages.

### Rule of Thumb

- **Build an MCP Prompt** when: you want any MCP client to offer a templated workflow using your server's data
- **Build a Skill** when: you want a client-specific workflow that orchestrates multiple servers or requires client-side logic

---

## End-to-End Use Cases

Here are real-world scenarios showing which primitives to use and why.

### 1. Customer Support Dashboard

| Need | Primitive | Implementation |
|------|-----------|---------------|
| Load open tickets as context | **Resource** | `tickets://open` — app attaches to every agent conversation |
| Search ticket history | **Tool** | `search_tickets(query, status)` — model searches when user asks about a customer |
| Escalate a ticket | **Tool** | `escalate_ticket(id, reason)` — model decides to escalate based on severity |
| Draft a response template | **Prompt** | `draft_response(tone="empathetic")` — user triggers when ready to reply |

### 2. DevOps Incident Management

| Need | Primitive | Implementation |
|------|-----------|---------------|
| Show current incidents | **Resource** | `incidents://all` — app displays as dashboard context |
| Get specific incident details | **Resource** | `incidents://{id}` — app loads when user clicks an incident |
| Create new incident | **Tool** | `create_incident(title, severity)` — model creates when user reports an issue |
| Run diagnostic command | **Tool** | `run_diagnostic(service, check)` — model runs checks when investigating |
| Triage all open incidents | **Prompt** | `triage_incidents(focus="severity")` — user triggers triage workflow |
| Post-mortem analysis | **Prompt** | `postmortem(incident_id)` — user triggers after incident resolution |

### 3. Data Analytics Platform

| Need | Primitive | Implementation |
|------|-----------|---------------|
| Database schema reference | **Resource** | `database://schema` — app provides so model can write correct SQL |
| Dataset preview | **Resource** | `datasets://{name}/preview` — app loads sample data as context |
| Execute SQL query | **Tool** | `run_sql(query)` — model writes and executes queries |
| Create visualization | **Tool** | `create_chart(data, chart_type)` — model generates charts |
| Generate weekly KPI report | **Prompt** | `kpi_report(period="weekly", team="engineering")` — user requests report |

### 4. Content Management System

| Need | Primitive | Implementation |
|------|-----------|---------------|
| Site structure overview | **Resource** | `cms://sitemap` — app provides site context |
| Article content | **Resource** | `articles://{slug}` — app loads article being discussed |
| Publish article | **Tool** | `publish_article(slug, schedule)` — model publishes when user approves |
| Update metadata | **Tool** | `update_seo(slug, title, description)` — model optimizes SEO fields |
| Content audit | **Prompt** | `audit_content(focus="seo")` — user triggers site-wide audit |
| Editorial calendar | **Prompt** | `plan_content(topic, audience)` — user plans content strategy |

### 5. Code Review Workflow

| Need | Primitive | Implementation |
|------|-----------|---------------|
| Codebase structure | **Resource** | `repo://tree` — app provides directory structure |
| File contents | **Resource** | `repo://file/{path}` — app loads files being reviewed |
| Run linter | **Tool** | `lint(path)` — model runs linter on suspicious code |
| Run tests | **Tool** | `run_tests(suite)` — model verifies changes don't break tests |
| Review pull request | **Prompt** | `review_pr(style="thorough")` — user triggers PR review |
| Explain code section | **Prompt** | `explain_code(depth="detailed")` — user asks for explanation |

---

## Decision Guide: Which Primitive to Use

```
Does it perform an action or have side effects?
  ├── Yes → TOOL
  │         (create, update, delete, send, execute)
  │
  └── No → Does the USER explicitly trigger it?
              ├── Yes → PROMPT
              │         (analyze, summarize, triage, generate report)
              │
              └── No → RESOURCE
                        (data context, background info, reference material)
```

### Quick Decision Table

| Signal | Use |
|--------|-----|
| Creates, updates, or deletes data | **Tool** |
| Calls an external API | **Tool** |
| Model should decide when to use it | **Tool** |
| Read-only data the app provides | **Resource** |
| Background context for conversations | **Resource** |
| Identified by a URI | **Resource** |
| User picks from a menu/command | **Prompt** |
| Template with configurable arguments | **Prompt** |
| Workflow that loads data + builds instructions | **Prompt** |

---

## Combining Primitives

The most powerful MCP servers combine all three primitives. Here's a pattern:

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server: Tasks                      │
│                                                           │
│  Resources (background context):                          │
│    tasks://all        → Always available as reference     │
│    tasks://{id}       → Load specific task details        │
│                                                           │
│  Tools (model-driven actions):                            │
│    create_task()      → Model creates tasks from chat     │
│    list_tasks()       → Model searches when user asks     │
│                                                           │
│  Prompts (user-initiated workflows):                      │
│    prioritize_tasks() → User triggers prioritization      │
│                          Loads data from tasks://all       │
│                          Builds analysis instruction       │
│                          Returns structured prompt         │
└─────────────────────────────────────────────────────────┘
```

Notice how the `prioritize_tasks` prompt internally reads the same data that the `tasks://all` resource exposes. The difference is **control**: the resource is loaded by the app, while the prompt is triggered by the user and wraps the data with a specific analysis instruction.

---

## References

- [MCP Specification — Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP Specification — Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP Specification — Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
- [MCP Concepts — Core Architecture](https://modelcontextprotocol.io/docs/concepts/architecture)
