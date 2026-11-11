from __future__ import annotations
import logging
import math
import os
import re
from typing import Any, Dict, Optional
import httpx
from fastmcp import Context
from fastmcp.server.dependencies import get_http_request

from coneshare_mcp.config import Settings, get_settings

logger = logging.getLogger(__name__)

RESOURCE_ID_REGEX = re.compile(r"^[0-9A-Za-z_-]{1,64}$")


def _validate_resource_id(value: Any, name: str = "id") -> str:
    """
    Validates that a resource identifier is safe for URL path interpolation and query parameters.
    Strictly permits only alphanumeric characters, underscores, and hyphens (up to 64 chars).
    Rejects path traversal ('..', '/'), query strings ('?'), fragments ('#'),
    and percent-encoding ('%').
    """
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Invalid {name}: must be a non-empty string identifier.")

    clean_value = value.strip()
    if not RESOURCE_ID_REGEX.match(clean_value):
        raise ValueError(
            f"Invalid {name}: '{value}'. Must be an alphanumeric identifier without slashes or special characters."
        )

    return clean_value


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
                    if isinstance(error_detail, dict):
                        if "detail" in error_detail:
                            msg = str(error_detail["detail"])
                        elif "non_field_errors" in error_detail:
                            errs = error_detail["non_field_errors"]
                            msg = ", ".join(errs) if isinstance(errs, list) else str(errs)
                        else:
                            # Format field errors: "field_name: error message"
                            msg = "; ".join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" for k, v in error_detail.items())
                    else:
                        msg = str(error_detail)
                except Exception:
                    msg = response.text

                raise ValueError(f"Coneshare API Error ({response.status_code}): {msg}")
            except httpx.RequestError as exc:
                raise ValueError(f"Network error communicating with Coneshare API: {exc}")

    @staticmethod
    def _paginate(res: Any, page: int, page_size: int) -> dict[str, Any]:
        if isinstance(res, list):
            total_count = len(res)
            start = max(0, (page - 1) * page_size)
            end = start + page_size
            items = res[start:end]
            total_pages = math.ceil(total_count / page_size) if page_size > 0 else 1
            return {
                "items": items,
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "has_next": end < total_count,
            }

        total_count = res.get("count", len(res.get("results", [])))
        current_page = res.get("current_page", page)
        actual_page_size = res.get("page_size", page_size)
        total_pages = res.get(
            "total_pages",
            math.ceil(total_count / actual_page_size) if actual_page_size > 0 else 1,
        )
        return {
            "items": res.get("results", []),
            "total_count": total_count,
            "page": current_page,
            "page_size": actual_page_size,
            "total_pages": total_pages,
            "has_next": bool(res.get("next")),
        }

    @staticmethod
    def _normalize_upload_path(path: Optional[str], file_name: str) -> Optional[str]:
        if not path:
            return None
        clean_path = path.strip().strip("/")
        if not clean_path:
            return None

        # Prevent directory traversal in destination folder path
        parts = [p.strip() for p in clean_path.split("/") if p.strip()]
        if any(p == ".." or p == "." for p in parts):
            raise ValueError(f"Path traversal ('..' or '.') is not allowed in destination path: '{path}'")

        folder_path = "/".join(parts)
        if not folder_path:
            return None

        # If clean_path already ends with the target file_name, preserve it as-is.
        if folder_path == file_name or folder_path.endswith(f"/{file_name}"):
            return folder_path

        # Treat path strictly as a destination folder and append file_name.
        # This correctly preserves dotted folder names (e.g. 'reports.2024')
        # without guessing file vs folder from file extensions.
        return f"{folder_path}/{file_name}"

    # --- Documents API ---

    async def list_documents(
        self,
        page: int = 1,
        page_size: int = 20,
        folder_id: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if folder_id:
            params["folder"] = _validate_resource_id(folder_id, "folder_id")
        res = await self._request("GET", "/documents/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def get_document(self, document_id: str) -> dict[str, Any]:
        doc_id = _validate_resource_id(document_id, "document_id")
        return await self._request("GET", f"/documents/{doc_id}/")

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
        doc_id = _validate_resource_id(document_id, "document_id")
        return await self._request("DELETE", f"/documents/{doc_id}/")

    async def request_document_upload(
        self,
        file_name: str,
        file_size: int,
        path: Optional[str] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "file_name": file_name,
            "file_size": file_size,
        }
        normalized_path = self._normalize_upload_path(path, file_name)
        if normalized_path:
            payload["path"] = normalized_path
        return await self._request("POST", "/uploads/document/request/", json_data=payload)

    async def finalize_document_upload(
        self,
        storage_key: str,
        unique_name: str,
        content_type: str = "application/octet-stream",
        path: Optional[str] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "storage_key": storage_key,
            "unique_name": unique_name,
            "content_type": content_type,
        }
        normalized_path = self._normalize_upload_path(path, unique_name)
        if normalized_path:
            payload["path"] = normalized_path
        return await self._request("POST", "/uploads/document/finalize/", json_data=payload)

    async def update_document(
        self,
        document_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        doc_id = _validate_resource_id(document_id, "document_id")
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        return await self._request("PATCH", f"/documents/{doc_id}/", json_data=payload)

    async def create_folder(self, name: str, parent_folder_id: Optional[str] = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"name": name}
        if parent_folder_id:
            payload["parent"] = _validate_resource_id(parent_folder_id, "parent_folder_id")
        return await self._request("POST", "/folders/", json_data=payload)

    async def update_folder(self, folder_id: str, name: str) -> dict[str, Any]:
        f_id = _validate_resource_id(folder_id, "folder_id")
        return await self._request("PATCH", f"/folders/{f_id}/", json_data={"name": name})

    async def delete_folder(self, folder_id: str) -> dict[str, Any]:
        f_id = _validate_resource_id(folder_id, "folder_id")
        return await self._request("DELETE", f"/folders/{f_id}/")

    async def move_items(
        self,
        destination_folder_id: Optional[str] = None,
        document_ids: Optional[list[str]] = None,
        folder_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        if not document_ids and not folder_ids:
            raise ValueError("Provide at least one document ID or folder ID.")
        clean_dest = _validate_resource_id(destination_folder_id, "destination_folder_id") if destination_folder_id is not None else None
        clean_doc_ids = [_validate_resource_id(d, "document_id") for d in (document_ids or [])]
        clean_folder_ids = [_validate_resource_id(f, "folder_id") for f in (folder_ids or [])]
        payload: dict[str, Any] = {
            "destination_folder_id": clean_dest,
            "document_ids": clean_doc_ids,
            "folder_ids": clean_folder_ids,
        }
        return await self._request("POST", "/actions/move/", json_data=payload)

    # --- Datarooms API ---

    async def list_datarooms(self, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        params = {"page": page, "page_size": page_size}
        res = await self._request("GET", "/datarooms/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def get_dataroom(self, dataroom_id: str) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        return await self._request("GET", f"/datarooms/{dr_id}/")

    async def create_dataroom(
        self,
        name: str,
        description: Optional[str] = None,
        document_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        clean_doc_ids = [_validate_resource_id(d, "document_id") for d in document_ids] if document_ids else None
        payload: dict[str, Any] = {"name": name}
        if description:
            payload["description"] = description
        res = await self._request("POST", "/datarooms/", json_data=payload)
        if isinstance(res, dict) and res.get("error"):
            return res

        if clean_doc_ids and isinstance(res, dict) and "id" in res:
            try:
                add_res = await self.add_content_to_dataroom(dataroom_id=res["id"], document_ids=clean_doc_ids)
                if isinstance(add_res, dict) and add_res.get("error"):
                    await self.delete_dataroom(dataroom_id=res["id"])
                    return {
                        "error": True,
                        "message": "Failed to attach documents to dataroom. Rolled back created dataroom.",
                        "details": add_res,
                    }
            except Exception as err:
                await self.delete_dataroom(dataroom_id=res["id"])
                raise err

        return res

    async def add_content_to_dataroom(self, dataroom_id: str, document_ids: list[str]) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        clean_doc_ids = [_validate_resource_id(d, "document_id") for d in document_ids]
        payload = {"document_ids": clean_doc_ids}
        return await self._request("POST", f"/datarooms/{dr_id}/add-content/", json_data=payload)

    async def remove_content_from_dataroom(
        self,
        dataroom_id: str,
        document_ids: Optional[list[str]] = None,
        dataroom_document_ids: Optional[list[str]] = None,
        dataroom_folder_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        doc_ids = dataroom_document_ids or document_ids
        payload: dict[str, Any] = {}
        if doc_ids:
            payload["dataroom_document_ids"] = [_validate_resource_id(d, "document_id") for d in doc_ids]
        if dataroom_folder_ids:
            payload["dataroom_folder_ids"] = [_validate_resource_id(f, "dataroom_folder_id") for f in dataroom_folder_ids]
        return await self._request("POST", f"/datarooms/{dr_id}/remove-content/", json_data=payload)

    async def update_dataroom(
        self,
        dataroom_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        return await self._request("PATCH", f"/datarooms/{dr_id}/", json_data=payload)

    async def delete_dataroom(self, dataroom_id: str) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        return await self._request("DELETE", f"/datarooms/{dr_id}/")

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
            params["document_id"] = _validate_resource_id(document_id, "document_id")
        if dataroom_id:
            params["dataroom_id"] = _validate_resource_id(dataroom_id, "dataroom_id")
        res = await self._request("GET", "/share-links/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def create_share_link(self, data: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", "/share-links/", json_data=data)

    async def update_share_link(self, share_link_id: str, data: dict[str, Any]) -> dict[str, Any]:
        sl_id = _validate_resource_id(share_link_id, "share_link_id")
        return await self._request("PATCH", f"/share-links/{sl_id}/", json_data=data)

    # --- Analytics API ---

    async def get_document_analytics(self, document_id: str) -> dict[str, Any]:
        doc_id = _validate_resource_id(document_id, "document_id")
        return await self._request("GET", f"/documents/{doc_id}/stats/")

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
            params["document_id"] = _validate_resource_id(document_id, "document_id")
        if share_link_id:
            params["share_link_id"] = _validate_resource_id(share_link_id, "share_link_id")
        if dataroom_id:
            params["dataroom_id"] = _validate_resource_id(dataroom_id, "dataroom_id")
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
        s_id = _validate_resource_id(session_id, "session_id")
        return await self._request("GET", f"/analytics/view-sessions/{s_id}/")

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
        u_id = _validate_resource_id(user_id, "user_id")
        return await self._request("GET", f"/admin/users/{u_id}/")

    async def list_login_activities(
        self,
        page: int = 1,
        page_size: int = 20,
        user_id: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if user_id:
            params["user_id"] = _validate_resource_id(user_id, "user_id")
        res = await self._request("GET", "/admin/login-activities/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)
