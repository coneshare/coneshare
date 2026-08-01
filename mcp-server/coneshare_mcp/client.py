from __future__ import annotations
import logging
from typing import Any, Dict, Optional
import httpx
from fastmcp import Context
from fastmcp.server.dependencies import get_http_request

from coneshare_mcp.config import Settings, get_settings

logger = logging.getLogger(__name__)


class ConeshareClient:
    def __init__(self, api_key: Optional[str] = None, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        if not api_key:
            raise ValueError(
                "No API Key provided. Please pass an Authorization header in your MCP client config "
                "(e.g. headers: {'Authorization': 'Bearer cs_live_...'})"
            )
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    @classmethod
    def from_ctx(cls, ctx: Optional[Context] = None) -> "ConeshareClient":
        api_key = None
        try:
            req = get_http_request()
            if req and hasattr(req, "headers"):
                auth_header = req.headers.get("authorization", "") or req.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    api_key = auth_header[7:].strip()
        except Exception as exc:
            logger.debug("Failed to extract Bearer token via get_http_request(): %s", exc)

        return cls(api_key=api_key, settings=get_settings())

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
        files: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        url = f"{self.settings.api_url}{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self.headers,
                    params=params,
                    json=json_data,
                    files=files,
                )
                if response.is_success:
                    if response.status_code == 204:
                        return {"success": True}
                    try:
                        return response.json()
                    except Exception:
                        return {"text": response.text}

                try:
                    error_detail = response.json()
                except Exception:
                    error_detail = response.text

                return {
                    "error": True,
                    "status": response.status_code,
                    "detail": error_detail,
                }
            except Exception as exc:
                return {
                    "error": True,
                    "status": 500,
                    "detail": str(exc),
                }

    @staticmethod
    def _paginate(res: Any, page: int, page_size: int) -> dict[str, Any]:
        if isinstance(res, list):
            return {
                "items": res,
                "total_count": len(res),
                "page": page,
                "page_size": page_size,
                "has_next": False,
            }
        return {
            "items": res.get("results", []),
            "total_count": res.get("count", 0),
            "page": page,
            "page_size": page_size,
            "has_next": bool(res.get("next")),
        }

    # --- Documents API ---

    async def list_documents(
        self,
        page: int = 1,
        page_size: int = 20,
        folder_id: Optional[str] = None,
    ) -> dict[str, Any]:
        params = {"page": page, "page_size": page_size}
        if folder_id:
            params["folder"] = folder_id
        res = await self._request("GET", "/documents/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def get_document(self, document_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/documents/{document_id}/")

    async def search_documents(
        self,
        query: str,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params = {"search": query, "page": page, "page_size": page_size}
        res = await self._request("GET", "/documents/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)



    async def delete_document(self, document_id: str) -> dict[str, Any]:
        return await self._request("DELETE", f"/documents/{document_id}/")

    # --- Datarooms API ---

    async def list_datarooms(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        params = {"page": page, "page_size": page_size}
        res = await self._request("GET", "/datarooms/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def get_dataroom(self, dataroom_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/datarooms/{dataroom_id}/")

    # --- Share Links API ---

    async def list_share_links(
        self,
        document_id: Optional[str] = None,
        dataroom_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if document_id:
            params["document_id"] = document_id
        if dataroom_id:
            params["dataroom_id"] = dataroom_id
        res = await self._request("GET", "/share-links/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def create_share_link(self, data: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "/share-links/", json_data=data)

    async def update_share_link(self, share_link_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PATCH", f"/share-links/{share_link_id}/", json_data=data)

    # --- Analytics API ---

    async def get_document_analytics(self, document_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/analytics/documents/{document_id}/")

    async def list_view_sessions(
        self,
        document_id: Optional[str] = None,
        share_link_id: Optional[str] = None,
        dataroom_id: Optional[str] = None,
        viewer_email: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if document_id:
            params["document_id"] = document_id
        if share_link_id:
            params["share_link_id"] = share_link_id
        if dataroom_id:
            params["dataroom_id"] = dataroom_id
        if viewer_email:
            params["viewer_email"] = viewer_email

        res = await self._request("GET", "/analytics/view-sessions/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        if isinstance(res, list):
            items = []
            for item in res:
                summary = {k: v for k, v in item.items() if k not in ("page_views", "dataroom_visits", "link_clicks")}
                summary["page_views_count"] = len(item.get("page_views") or [])
                items.append(summary)
            return self._paginate(items, page, page_size)

        raw_results = res.get("results", [])
        items = []
        for item in raw_results:
            summary = {k: v for k, v in item.items() if k not in ("page_views", "dataroom_visits", "link_clicks")}
            summary["page_views_count"] = len(item.get("page_views") or [])
            items.append(summary)

        return {
            "items": items,
            "total_count": res.get("count", 0),
            "page": page,
            "page_size": page_size,
            "has_next": bool(res.get("next")),
        }

    async def get_view_session(self, session_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/analytics/view-sessions/{session_id}/")

    # --- Admin API ---

    async def list_admin_users(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if search:
            params["search"] = search
        res = await self._request("GET", "/admin/users/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def get_admin_user_details(self, user_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/admin/users/{user_id}/")

    async def list_login_activities(
        self,
        page: int = 1,
        page_size: int = 20,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if user_id:
            params["user_id"] = user_id
        res = await self._request("GET", "/admin/login-activities/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)
