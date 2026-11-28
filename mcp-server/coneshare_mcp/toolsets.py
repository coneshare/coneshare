from __future__ import annotations

import logging
from typing import Any, Optional, Sequence

from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_access_token, get_http_request
from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext
from fastmcp.tools import Tool
import mcp.types as mt

logger = logging.getLogger(__name__)

BASE_PRESET_DEFAULT: frozenset[str] = frozenset({"core", "folders", "destructive"})
BASE_PRESET_CORE: frozenset[str] = frozenset({"core"})
BASE_PRESET_ALL: frozenset[str] = frozenset({"core", "folders", "destructive", "admin"})

BASE_PRESETS: dict[str, frozenset[str]] = {
    "default": BASE_PRESET_DEFAULT,
    "core": BASE_PRESET_CORE,
    "all": BASE_PRESET_ALL,
}
ADDITIVE_TAGS: frozenset[str] = frozenset({"folders", "destructive", "admin"})
FUNCTIONAL_TAGS: frozenset[str] = BASE_PRESET_ALL

TOOLSET_HEADER_NAME = "X-Coneshare-Toolsets"


def extract_requested_toolsets_raw() -> Optional[str]:
    """Read `?toolsets=` query param (streamable-http) or `X-Coneshare-Toolsets` header, returning None outside HTTP.

    Legacy `MCP_TRANSPORT=sse` posts subsequent JSON-RPC calls to `/messages/?session_id=...`
    without connect-URL query parameters, so legacy SSE clients should pass `X-Coneshare-Toolsets`.
    """
    try:
        req = get_http_request()
    except Exception:
        return None

    if req is None:
        return None

    query_params = getattr(req, "query_params", None)
    if query_params is not None:
        raw_query = query_params.get("toolsets")
        if isinstance(raw_query, str) and raw_query.strip():
            return raw_query

    headers = getattr(req, "headers", None)
    if headers is not None:
        raw_header = headers.get("x-coneshare-toolsets") or headers.get(TOOLSET_HEADER_NAME)
        if isinstance(raw_header, str) and raw_header.strip():
            return raw_header

    return None


def parse_requested_toolsets(raw: Optional[str]) -> frozenset[str]:
    """
    Parse a comma-separated toolsets value using deterministic precedence:
    1. Base preset precedence: `all` > `core` > `default` (falls back to `default`).
    2. Additive tags (`folders`, `destructive`, `admin`) are unioned into the base.
    3. Unknown tokens are ignored with a warning log.
    """
    if not raw or not raw.strip():
        return BASE_PRESET_DEFAULT

    tokens: list[str] = [part.strip().lower() for part in raw.split(",") if part.strip()]
    if not tokens:
        return BASE_PRESET_DEFAULT

    bases_found: set[str] = set()
    additives_found: set[str] = set()

    for token in tokens:
        if token in BASE_PRESETS:
            bases_found.add(token)
        elif token in ADDITIVE_TAGS:
            additives_found.add(token)
        else:
            logger.warning("Ignoring unknown MCP toolset token: %r", token)

    if "all" in bases_found:
        selected = set(BASE_PRESET_ALL)
    elif "core" in bases_found:
        selected = set(BASE_PRESET_CORE)
    else:
        selected = set(BASE_PRESET_DEFAULT)

    selected |= additives_found
    return frozenset(selected)


def _get_access_token_safely() -> Any:
    try:
        return get_access_token()
    except Exception:
        return None


def evaluate_tool_access(
    tool_name: str,
    tool_tags: set[str],
    requested_toolsets: frozenset[str],
    access_token: Any,
) -> tuple[bool, Optional[str]]:
    """
    Evaluate whether a tool is visible/callable for the active request's toolsets and token claims.
    Returns `(allowed, denial_reason)`.
    """
    if access_token is not None:
        raw_scopes = getattr(access_token, "scopes", None)
        scopes: Optional[set[str]] = set(raw_scopes) if raw_scopes is not None else None
        claims = getattr(access_token, "claims", None) or {}
        auth_type = claims.get("auth_type")

        if auth_type == "oauth2":
            if "admin" in tool_tags:
                return (
                    False,
                    f"Tool '{tool_name}' requires an API key and is not permitted with OAuth 2.1 tokens.",
                )
            if "destructive" in tool_tags:
                return (
                    False,
                    f"Tool '{tool_name}' is a destructive/full-access action and is not permitted with OAuth 2.1 tokens.",
                )
            if "viewer_analytics" in tool_tags:
                return (
                    False,
                    f"Tool '{tool_name}' accesses viewer session telemetry and is not permitted with OAuth 2.1 tokens.",
                )

        if scopes is not None and "write" not in scopes:
            if "write" in tool_tags or "destructive" in tool_tags:
                return (
                    False,
                    f"Tool '{tool_name}' requires 'write' scope, which is not granted to the current token.",
                )

    tool_func_tags = tool_tags & FUNCTIONAL_TAGS
    if not tool_func_tags or not tool_func_tags.issubset(requested_toolsets):
        missing = sorted(tool_func_tags - requested_toolsets)
        if "admin" in missing:
            return (
                False,
                f"Tool '{tool_name}' is in the 'admin' toolset and is disabled by default. "
                "Reconnect with '?toolsets=admin' or header 'X-Coneshare-Toolsets: admin' to enable organization admin tools.",
            )
        missing_label = ", ".join(missing) if missing else "requested"
        return (
            False,
            f"Tool '{tool_name}' requires toolset(s) [{missing_label}], which are not enabled in the current preset. "
            f"Reconnect without '?toolsets=core' or add '{missing_label}' to '?toolsets=' / '{TOOLSET_HEADER_NAME}'.",
        )

    return True, None


class ToolsetFilterMiddleware(Middleware):
    """Filters `tools/list` and enforces fail-closed `tools/call` checks per request."""

    @staticmethod
    def _request_context_state() -> tuple[frozenset[str], Any]:
        requested = parse_requested_toolsets(extract_requested_toolsets_raw())
        access_token = _get_access_token_safely()
        return requested, access_token

    async def on_list_tools(
        self,
        context: MiddlewareContext[mt.ListToolsRequest],
        call_next: CallNext[mt.ListToolsRequest, Sequence[Tool]],
    ) -> Sequence[Tool]:
        tools = await call_next(context)
        requested_toolsets, access_token = self._request_context_state()
        filtered: list[Tool] = []
        for tool in tools:
            allowed, _ = evaluate_tool_access(
                tool_name=tool.name,
                tool_tags=set(tool.tags or ()),
                requested_toolsets=requested_toolsets,
                access_token=access_token,
            )
            if allowed:
                filtered.append(tool)
        return filtered

    async def on_call_tool(
        self,
        context: MiddlewareContext[mt.CallToolRequestParams],
        call_next: CallNext[mt.CallToolRequestParams, Any],
    ) -> Any:
        tool_name = context.message.name
        fastmcp_ctx = context.fastmcp_context
        if fastmcp_ctx is not None:
            tool = await fastmcp_ctx.fastmcp.get_tool(tool_name)
            if tool is not None:
                requested_toolsets, access_token = self._request_context_state()
                allowed, reason = evaluate_tool_access(
                    tool_name=tool.name,
                    tool_tags=set(tool.tags or ()),
                    requested_toolsets=requested_toolsets,
                    access_token=access_token,
                )
                if not allowed:
                    raise ToolError(reason or f"Tool '{tool_name}' is not enabled for this request.")
        return await call_next(context)
