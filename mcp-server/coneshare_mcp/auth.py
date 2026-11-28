from __future__ import annotations

from collections import OrderedDict
import hashlib
import logging
import time
from typing import Optional

import httpx
from fastmcp.server.auth import AccessToken, RemoteAuthProvider, TokenVerifier
from pydantic import AnyHttpUrl
from starlette.routing import Route

from coneshare_mcp.config import Settings

logger = logging.getLogger(__name__)

CONESHARE_OAUTH_SCOPES = [
    "read",
    "write",
]

DEFAULT_VERIFY_CACHE_TTL_SECONDS = 30.0
DEFAULT_VERIFY_CACHE_MAX_SIZE = 1024


class ConeshareTokenVerifier(TokenVerifier):
    """
    Verifies incoming Bearer credentials against Django's /oauth/verify/ endpoint.
    Supports both OAuth 2.1 access tokens and existing cs_live_... API keys, validates
    RFC 8707 resource audience matching, and uses a bounded SHA-256-keyed TTL cache.
    """

    def __init__(
        self,
        api_url: str,
        base_url: Optional[str] = None,
        resource_url: Optional[str] = None,
        cache_ttl_seconds: float = DEFAULT_VERIFY_CACHE_TTL_SECONDS,
        cache_max_size: int = DEFAULT_VERIFY_CACHE_MAX_SIZE,
    ):
        super().__init__(base_url=base_url)
        self.api_url = api_url.rstrip("/")
        self.resource_url = resource_url
        self.cache_ttl_seconds = max(0.0, cache_ttl_seconds)
        self.cache_max_size = max(1, cache_max_size)
        self._cache: OrderedDict[str, tuple[AccessToken, float]] = OrderedDict()

    @staticmethod
    def _token_digest(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _get_cached(self, digest: str, now_mono: float) -> AccessToken | None:
        entry = self._cache.get(digest)
        if entry is None:
            return None
        access_token, cache_expires_at = entry
        if now_mono >= cache_expires_at:
            self._cache.pop(digest, None)
            return None
        self._cache.move_to_end(digest)
        return access_token

    def _store_cached(self, digest: str, access_token: AccessToken, now_mono: float) -> None:
        if self.cache_ttl_seconds <= 0:
            return
        ttl = self.cache_ttl_seconds
        if access_token.expires_at is not None:
            remaining = float(access_token.expires_at) - time.time()
            if remaining <= 0:
                return
            ttl = min(ttl, remaining)
        self._cache[digest] = (access_token, now_mono + ttl)
        self._cache.move_to_end(digest)
        while len(self._cache) > self.cache_max_size:
            self._cache.popitem(last=False)

    async def verify_token(self, token: str) -> AccessToken | None:
        clean_token = token.strip() if isinstance(token, str) else ""
        if not clean_token:
            return None

        digest = self._token_digest(clean_token)
        now_mono = time.monotonic()
        cached = self._get_cached(digest, now_mono)
        if cached is not None:
            return cached

        url = f"{self.api_url}/oauth/verify/"
        params = {"resource": self.resource_url} if self.resource_url else None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    url,
                    params=params,
                    headers={
                        "Authorization": f"Bearer {clean_token}",
                        "Accept": "application/json",
                    },
                )
        except httpx.RequestError as exc:
            logger.warning("Failed to contact Coneshare OAuth verification endpoint: %s", exc)
            return None

        if response.status_code != 200:
            self._cache.pop(digest, None)
            return None

        try:
            payload = response.json()
        except Exception:
            return None

        if not isinstance(payload, dict) or not payload.get("active"):
            return None

        raw_scopes = payload.get("scopes") or []
        scopes = [str(s) for s in raw_scopes if isinstance(s, str)]
        raw_exp = payload.get("exp")
        expires_at = int(raw_exp) if isinstance(raw_exp, (int, float)) else None

        claims = {
            "auth_type": payload.get("auth_type", "oauth2"),
            "user_id": payload.get("user_id", ""),
        }
        access_token = AccessToken(
            token=clean_token,
            client_id=str(payload.get("client_id") or "coneshare"),
            scopes=scopes,
            expires_at=expires_at,
            claims=claims,
        )
        self._store_cached(digest, access_token, time.monotonic())
        return access_token


class ConeshareRemoteAuthProvider(RemoteAuthProvider):
    """
    Extends FastMCP RemoteAuthProvider so RFC 9728 protected-resource metadata is served
    at both the path-scoped route (e.g. /.well-known/oauth-protected-resource/mcp/sse)
    and the root discovery route (/.well-known/oauth-protected-resource).
    """

    def get_routes(self, mcp_path: str | None = None) -> list[Route]:
        routes = list(super().get_routes(mcp_path=mcp_path))
        root_well_known = "/.well-known/oauth-protected-resource"
        has_root = any(getattr(route, "path", None) == root_well_known for route in routes)
        if routes and not has_root:
            primary = routes[0]
            routes.append(
                Route(
                    root_well_known,
                    endpoint=primary.endpoint,
                    methods=list(primary.methods or ["GET", "OPTIONS"]),
                )
            )
        return routes


def build_auth_provider(settings: Settings) -> Optional[ConeshareRemoteAuthProvider]:
    if not settings.oauth_enabled:
        return None

    base_url = (settings.site_domain or "").strip().rstrip("/")
    if not base_url:
        raise RuntimeError("SITE_DOMAIN is required when OAuth is enabled.")
    resource_url = f"{base_url}{settings.mcp_path}"

    verifier = ConeshareTokenVerifier(
        api_url=settings.api_url,
        base_url=base_url,
        resource_url=resource_url,
    )
    return ConeshareRemoteAuthProvider(
        token_verifier=verifier,
        authorization_servers=[AnyHttpUrl(base_url)],
        base_url=base_url,
        scopes_supported=CONESHARE_OAUTH_SCOPES,
        resource_name="Coneshare Workspace MCP",
    )
