# 🚀 Real-Time MCP Event Subscriptions via Coneshare Automations — Design & Implementation Plan

> **Status:** Draft / Planned (Future Phase)
> **Goal:** Enable AI agents (Claude Code, Codex, Antigravity CLI `agy`, Cursor) to subscribe to real-time Coneshare events (`link.viewed`, `document.created`, `nda.accepted`) over Remote MCP SSE streams without polling.

---

## 1. 📌 Architectural Overview

Instead of setting up a separate Redis Pub/Sub infrastructure, the **Real-Time MCP Event System** integrates directly into Coneshare's existing [`backend/automations`](../../docs/features/automations.md) pipeline.

When events occur in Coneshare, the `automations` Celery task pipeline delivers events to a dedicated internal webhook endpoint on `coneshare-mcp` (`http://mcp_server:8001/internal/events/`). The MCP server then broadcasts real-time Server-Sent Event (SSE) notifications (`notifications/resources/updated`) to the user's active AI client session.

```
+---------------------------------------------------------------------------------------------------+
| 1. CONESHARE BACKEND (Django + automations)                                                       |
|                                                                                                   |
| Event occurs (e.g. ViewSession created / Document created)                                        |
|   └─► `dispatch_automation_event(event_type, payload)`                                            |
|   └─► Celery task evaluates AutomationRules & Destinations                                        |
|   └─► For MCP destination / rule:                                                                 |
|       Sends HTTP POST to `http://mcp_server:8001/internal/events/`                                |
|       Header: `X-Internal-Token: ${INTERNAL_API_TOKEN}`                                           |
+---------------------------------------------------------------------------------------------------+
                                           |
                                           | Internal Docker Network HTTP POST
                                           v
+---------------------------------------------------------------------------------------------------+
| 2. CONESHARE REMOTE MCP SERVER (coneshare-mcp)                                                    |
|                                                                                                   |
| FastMCP server receives internal POST at `/internal/events/`:                                     |
|   └─► Validates `X-Internal-Token`                                                                |
|   └─► Matches `user_id` / `organization_id` to active client SSE connection                       |
|   └─► Pushes FastMCP SSE Notification:                                                            |
|       `notifications/resources/updated` (resource://coneshare/events/live)                        |
+---------------------------------------------------------------------------------------------------+
                                           |
                                           | SSE Stream (`https://mcp.coneshare.com/sse`)
                                           v
+---------------------------------------------------------------------------------------------------+
| 3. AI CLIENT (Claude Code / Codex / agy CLI / Cursor)                                             |
|                                                                                                   |
| Receives push notification over SSE stream:                                                       |
|   └─► AI Agent wakes up and executes follow-up tool call / action!                                |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. 🔑 Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Event Provider | `backend/automations` | Single source of truth. Reuses existing Celery event dispatch, scope rules, and delivery retries. |
| Server Transport | HTTP POST to `/internal/events/` | Simple, secure, internal Docker container communication using `INTERNAL_API_TOKEN`. |
| MCP Notification | `notify_resource_updated` | Native MCP standard for pushing resource changes over active SSE client connections. |
| Scoping & Security | Per-User Token Scoping | Events are filtered by `user_id` / `organization_id` so agents only receive events for their own workspace. |

---

## 3. ⚙️ Implementation Details

### 3.1 Backend Automations Destination (`backend/automations/models.py`)

Add `MCP` as a recognized destination type:

```python
class AutomationDestination(BaseModel):
    class DestinationType(models.TextChoices):
        SLACK = 'slack', 'Slack'
        DISCORD = 'discord', 'Discord'
        WEBHOOK = 'webhook', 'Webhook'
        EMAIL = 'email', 'Email'
        MCP = 'mcp', 'MCP Server'
```

### 3.2 Internal Webhook Delivery (`backend/automations/tasks.py`)

When Celery processes an `MCP` destination delivery:

```python
def _deliver_mcp_event(destination, event_type, payload):
    mcp_endpoint = settings.CORE_API_URL.replace(":8080", ":8001") + "/internal/events/"
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": settings.INTERNAL_API_TOKEN,
    }
    body = {
        "event_type": event_type,
        "organization_id": str(destination.organization_id),
        "user_id": str(destination.created_by_id),
        "payload": payload,
    }
    requests.post(mcp_endpoint, json=body, headers=headers, timeout=5.0)
```

### 3.3 FastMCP Internal Endpoint & Notification (`mcp-server/coneshare_mcp/server.py`)

Mount an internal route on the ASGI app to receive events and trigger FastMCP resource updates:

```python
@mcp.app.post("/internal/events/")
async def handle_internal_event(request: Request):
    auth_token = request.headers.get("X-Internal-Token")
    if auth_token != os.getenv("INTERNAL_API_TOKEN", "supersecrettoken"):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    event_data = await request.json()
    user_id = event_data.get("user_id")

    # Broadcast MCP SSE notification to user's connected AI client sessions
    resource_uri = f"resource://coneshare/events/live"
    await mcp.notify_resource_updated(uri=resource_uri)

    return JSONResponse({"status": "delivered"})
```

### 3.4 MCP Resource & Tool Definitions (`coneshare_mcp/tools/events.py`)

```python
@mcp.resource("resource://coneshare/events/live")
async def get_live_events(ctx: Context) -> str:
    """Live stream of real-time Coneshare events (link.viewed, document.created)."""
    client = ConeshareClient.from_ctx(ctx)
    return json.dumps(await client.get_recent_events())

@mcp.tool()
async def subscribe_events(
    ctx: Context,
    event_types: list[str] = Field(description="List of events to subscribe: ['link.viewed', 'document.created']"),
) -> dict:
    """Subscribe your AI agent session to real-time Coneshare workspace events."""
    return {"subscribed": True, "event_types": event_types}
```

---

## 🗓️ Implementation Roadmap

| Phase | Deliverables | Target Files |
|---|---|---|
| **Phase 1: Backend Integration** | Add `DestinationType.MCP` to `AutomationDestination`, implement internal HTTP delivery task | `backend/automations/models.py`, `backend/automations/tasks.py` |
| **Phase 2: MCP Webhook Route** | Mount `/internal/events/` on FastMCP ASGI app, add `INTERNAL_API_TOKEN` validation | `mcp-server/coneshare_mcp/server.py` |
| **Phase 3: MCP Subscriptions** | Expose `resource://coneshare/events/live` and `subscribe_events` tool | `mcp-server/coneshare_mcp/tools/events.py` |
| **Phase 4: E2E Testing** | Test end-to-end event triggering from Django view creation to SSE client notification | `mcp-server/tests/test_events.py` |
