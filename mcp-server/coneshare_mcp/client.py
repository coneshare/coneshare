from __future__ import annotations
import logging
import math
import os
import re
from typing import Any, Dict, Optional
from urllib.parse import urlparse, urlunparse
import httpx
from fastmcp import Context
from fastmcp.server.dependencies import get_access_token, get_http_request

from coneshare_mcp.config import Settings, get_settings

logger = logging.getLogger(__name__)

RESOURCE_ID_REGEX = re.compile(r"^[0-9A-Za-z_-]{1,64}$")

TEXT_CONTENT_TYPE_BY_EXTENSION: dict[str, str] = {
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".log": "text/plain",
    ".text": "text/plain",
    ".json": "application/json",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
}

MAX_TEXT_READ_BYTES = 2 * 1024 * 1024
DEFAULT_TEXT_READ_CHARS = 100_000
MAX_TEXT_READ_CHARS = 200_000


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

        if not api_key:
            try:
                access_token = get_access_token()
                if access_token and getattr(access_token, "token", None):
                    api_key = str(access_token.token).strip()
            except Exception as exc:
                logger.debug("Failed to extract token via get_access_token(): %s", exc)

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
    def _split_clean_folder_segments(path: Optional[str]) -> list[str]:
        if not path:
            return []
        clean_path = path.strip().strip("/")
        if not clean_path:
            return []

        parts = [p.strip() for p in clean_path.split("/") if p.strip()]
        if any(p == ".." or p == "." for p in parts):
            raise ValueError(f"Path traversal ('..' or '.') is not allowed in destination path: '{path}'")
        return parts

    @classmethod
    def _normalize_upload_path(cls, path: Optional[str], file_name: str) -> Optional[str]:
        parts = cls._split_clean_folder_segments(path)
        if not parts:
            return None

        folder_path = "/".join(parts)

        # If clean_path already ends with the target file_name, preserve it as-is.
        if folder_path == file_name or folder_path.endswith(f"/{file_name}"):
            return folder_path

        # Treat path strictly as a destination folder and append file_name.
        # This correctly preserves dotted folder names (e.g. 'reports.2024')
        # without guessing file vs folder from file extensions.
        return f"{folder_path}/{file_name}"

    @classmethod
    def _extract_folder_segments(
        cls,
        path: Optional[str],
        file_name: str,
        raw_file_name: Optional[str] = None,
    ) -> tuple[list[str], Optional[str]]:
        parts = cls._split_clean_folder_segments(path)
        match_names = {file_name}
        if raw_file_name:
            match_names.add(raw_file_name)
        if parts and parts[-1] in match_names:
            parts = parts[:-1]
        return parts, ("/".join(parts) if parts else None)

    def _resolve_fileserver_url(
        self,
        url: str,
        prefixes: tuple[str, ...] = ("/files/upload/", "/files/download/"),
    ) -> str:
        """Rewrite internal core file-server URLs when configured for container networking."""
        internal_base = self.settings.fileserver_internal_url
        parsed = urlparse(url)
        if internal_base and any(parsed.path.startswith(prefix) for prefix in prefixes):
            base_parsed = urlparse(internal_base)
            base_path = base_parsed.path.rstrip("/")
            return urlunparse((
                base_parsed.scheme,
                base_parsed.netloc,
                f"{base_path}{parsed.path}",
                parsed.params,
                parsed.query,
                parsed.fragment,
            ))
        return url

    def _resolve_upload_url(self, upload_url: str) -> str:
        """Rewrite internal core file-server upload URLs when configured for container networking."""
        return self._resolve_fileserver_url(upload_url, prefixes=("/files/upload/",))

    async def _upload_bytes(self, upload_url: str, data: bytes, content_type: str) -> None:
        target_url = self._resolve_upload_url(upload_url)
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.put(
                    target_url,
                    content=data,
                    headers={"Content-Type": content_type},
                )
                if not response.is_success:
                    raise ValueError(f"Storage upload failed ({response.status_code}): {response.text}")
            except httpx.RequestError as exc:
                raise ValueError(f"Network error uploading content to storage: {exc}") from exc

    async def _download_bytes_bounded(self, download_url: str, max_bytes: int) -> bytes:
        target_url = self._resolve_fileserver_url(download_url, prefixes=("/files/download/",))
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("GET", target_url) as response:
                    if not response.is_success:
                        err_chunks: list[bytes] = []
                        err_size = 0
                        async for chunk in response.aiter_bytes():
                            err_chunks.append(chunk[: max(0, 4096 - err_size)])
                            err_size += len(chunk)
                            if err_size >= 4096:
                                break
                        err_text = b"".join(err_chunks).decode("utf-8", errors="replace").strip()
                        raise ValueError(f"Storage download failed ({response.status_code}): {err_text}")

                    content_length_raw = response.headers.get("Content-Length")
                    content_length: Optional[int] = None
                    if content_length_raw:
                        try:
                            content_length = int(content_length_raw)
                        except ValueError:
                            content_length = None

                    if content_length is not None and content_length > max_bytes:
                        raise ValueError(
                            f"Document exceeds maximum readable text size ({max_bytes} bytes). "
                            "Use get_document_download_url instead."
                        )

                    chunks: list[bytes] = []
                    total_bytes = 0
                    async for chunk in response.aiter_bytes():
                        total_bytes += len(chunk)
                        if total_bytes > max_bytes:
                            raise ValueError(
                                f"Document exceeds maximum readable text size ({max_bytes} bytes). "
                                "Use get_document_download_url instead."
                            )
                        chunks.append(chunk)
                    return b"".join(chunks)
            except httpx.RequestError as exc:
                raise ValueError(f"Network error downloading content from storage: {exc}") from exc

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

    @classmethod
    def _build_document_next_step_hint(cls, doc: dict[str, Any]) -> str:
        if doc.get("status") == "uploading":
            return "Document is still uploading; retry shortly before reading or downloading."
        raw_size = doc.get("file_size")
        oversized = isinstance(raw_size, int) and not isinstance(raw_size, bool) and raw_size > MAX_TEXT_READ_BYTES
        if not oversized:
            try:
                cls._resolve_readable_text_type(doc)
                return "Text document: call read_text_document(document_id=...) to load UTF-8 content into context."
            except ValueError:
                pass
        return "Binary or large file: call get_document_download_url(document_id=...) for a temporary signed download URL."

    async def get_document(self, document_id: str) -> dict[str, Any]:
        doc_id = _validate_resource_id(document_id, "document_id")
        res = await self._request("GET", f"/documents/{doc_id}/")
        if isinstance(res, dict) and not res.get("error"):
            return {**res, "next_step_hint": self._build_document_next_step_hint(res)}
        return res

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

    @staticmethod
    def _validate_positive_file_size(file_size: int) -> int:
        if isinstance(file_size, bool) or not isinstance(file_size, int) or file_size <= 0:
            raise ValueError("file_size must be a positive integer.")
        return file_size

    async def request_document_upload(
        self,
        file_name: str,
        file_size: int,
        path: Optional[str] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "file_name": file_name,
            "file_size": self._validate_positive_file_size(file_size),
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

    async def request_version_upload(
        self,
        document_id: str,
        file_name: str,
        file_size: int,
    ) -> dict[str, Any]:
        doc_id = _validate_resource_id(document_id, "document_id")
        payload: dict[str, Any] = {
            "file_name": file_name,
            "file_size": self._validate_positive_file_size(file_size),
        }
        return await self._request("POST", f"/uploads/document/{doc_id}/versions/request/", json_data=payload)

    async def finalize_version_upload(
        self,
        document_id: str,
        storage_key: str,
        file_name: Optional[str] = None,
        content_type: str = "application/octet-stream",
    ) -> dict[str, Any]:
        doc_id = _validate_resource_id(document_id, "document_id")
        payload: dict[str, Any] = {
            "storage_key": storage_key,
            "content_type": content_type,
        }
        if file_name:
            payload["file_name"] = file_name
        return await self._request("POST", f"/uploads/document/{doc_id}/versions/finalize/", json_data=payload)

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

    @staticmethod
    def _validate_text_file_name(file_name: str) -> tuple[str, str, str]:
        raw_name = file_name.strip() if isinstance(file_name, str) else ""
        if not raw_name:
            raise ValueError("file_name must be a non-empty string.")
        if "/" in raw_name or "\\" in raw_name:
            raise ValueError("Provide folder paths via 'path', not '/' inside 'file_name'.")

        clean_name = raw_name.rstrip(".")
        if not clean_name or (clean_name.startswith(".") and "." not in clean_name[1:]):
            raise ValueError(f"Invalid file_name: '{file_name}'. Provide a valid filename with a stem.")

        _, ext = os.path.splitext(clean_name)
        if not ext:
            clean_name = f"{clean_name}.md"
            ext = ".md"

        return raw_name, clean_name, ext

    @staticmethod
    def _prepare_text_content(content: str, ext: str, content_type: Optional[str] = None) -> tuple[bytes, str]:
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Document content cannot be empty.")

        data = content.encode("utf-8")
        resolved_content_type = (
            content_type.strip()
            if isinstance(content_type, str) and content_type.strip()
            else TEXT_CONTENT_TYPE_BY_EXTENSION.get(ext.lower(), "text/plain")
        )
        return data, resolved_content_type

    async def _apply_optional_description(self, doc: Any, description: Optional[str]) -> dict[str, Any]:
        if not (isinstance(description, str) and description.strip() and isinstance(doc, dict) and doc.get("id")):
            return doc

        try:
            updated = await self.update_document(
                document_id=str(doc["id"]),
                description=description.strip(),
            )
            if isinstance(updated, dict) and not updated.get("error"):
                return updated
            return {**doc, "description_update_error": "Failed to update document description."}
        except ValueError as exc:
            logger.warning(
                "Document %s updated, but updating description failed: %s",
                doc.get("id"),
                exc,
            )
            return {**doc, "description_update_error": str(exc)}

    async def create_folder(self, name: str, parent_folder_id: Optional[str] = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"name": name}
        if parent_folder_id:
            payload["parent"] = _validate_resource_id(parent_folder_id, "parent_folder_id")
        return await self._request("POST", "/folders/", json_data=payload)

    async def _find_subfolder_id(
        self,
        parent_id: Optional[str],
        segment: str,
        full_path: str,
    ) -> Optional[str]:
        endpoint = f"/folders/{_validate_resource_id(parent_id, 'folder_id')}/" if parent_id else "/folders/"
        listing = await self._request("GET", endpoint)
        if not isinstance(listing, dict) or listing.get("error"):
            raise ValueError(f"Failed to list folders while resolving destination path '{full_path}'.")

        sub_folders = listing.get("sub_folders", [])
        existing = next(
            (f for f in sub_folders if isinstance(f, dict) and f.get("name") == segment),
            None,
        )
        return str(existing["id"]) if existing and existing.get("id") else None

    async def ensure_folder_path(self, path: str) -> Optional[str]:
        """Walk existing root/subfolders and create only missing segments along a relative path."""
        segments = self._split_clean_folder_segments(path)
        if not segments:
            return None

        parent_id: Optional[str] = None
        parent_just_created = False
        for segment in segments:
            if not parent_just_created:
                existing_id = await self._find_subfolder_id(parent_id, segment, path)
                if existing_id:
                    parent_id = existing_id
                    continue

            created = await self.create_folder(name=segment, parent_folder_id=parent_id)
            if not isinstance(created, dict) or created.get("error") or not created.get("id"):
                raise ValueError(f"Failed to create folder '{segment}' along destination path '{path}'.")

            if created.get("name") is not None and created.get("name") != segment:
                resolved_id = await self._find_subfolder_id(parent_id, segment, path)
                if not resolved_id:
                    raise ValueError(
                        f"Folder '{segment}' was renamed to '{created.get('name')}' during concurrent creation "
                        f"and could not be re-resolved along destination path '{path}'."
                    )
                parent_id = resolved_id
                parent_just_created = False
            else:
                parent_id = str(created["id"])
                parent_just_created = True

        return parent_id

    async def create_text_document(
        self,
        file_name: str,
        content: str,
        content_type: Optional[str] = None,
        path: Optional[str] = None,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        """Upload UTF-8 text/Markdown content directly to Personal Documents without an external PUT."""
        raw_name, clean_name, ext = self._validate_text_file_name(file_name)
        data, resolved_content_type = self._prepare_text_content(content, ext, content_type)

        folder_segments, folder_path = self._extract_folder_segments(path, clean_name, raw_name)
        if folder_segments:
            await self.ensure_folder_path("/".join(folder_segments))

        request_path = f"{folder_path}/{clean_name}" if folder_path else None
        req_res = await self.request_document_upload(
            file_name=clean_name,
            file_size=len(data),
            path=request_path,
        )
        if not isinstance(req_res, dict) or req_res.get("error"):
            raise ValueError("Failed to request upload URL for text document.")

        upload_url = req_res.get("upload_url")
        storage_key = req_res.get("storage_key")
        unique_name = req_res.get("unique_name") or clean_name
        if not upload_url or not storage_key:
            raise ValueError("Upload request response missing required 'upload_url' or 'storage_key'.")

        await self._upload_bytes(
            upload_url=str(upload_url),
            data=data,
            content_type=resolved_content_type,
        )

        finalize_path = f"{folder_path}/{unique_name}" if folder_path else None
        doc = await self.finalize_document_upload(
            storage_key=str(storage_key),
            unique_name=str(unique_name),
            content_type=resolved_content_type,
            path=finalize_path,
        )
        res = await self._apply_optional_description(doc, description)
        if isinstance(res, dict) and not res.get("error"):
            actual_name = str(res.get("name") or "").strip()
            stem, ext = os.path.splitext(clean_name)
            collision_pattern = re.compile(rf"^{re.escape(stem)} \(\d+\){re.escape(ext)}$")
            if (
                actual_name
                and collision_pattern.match(actual_name)
                and ext.lower() in TEXT_CONTENT_TYPE_BY_EXTENSION
            ):
                return {
                    **res,
                    "note": (
                        f"A document named '{clean_name}' already existed, so a separate copy "
                        f"'{actual_name}' was created. To replace an existing document in place "
                        "without changing share links, call update_text_document on its document_id."
                    ),
                }
        return res

    async def update_text_document(
        self,
        document_id: str,
        content: str,
        file_name: Optional[str] = None,
        content_type: Optional[str] = None,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        """Upload a new UTF-8 text/Markdown version for an existing document, preserving its ID and share links."""
        doc_id = _validate_resource_id(document_id, "document_id")

        if file_name is not None:
            _, clean_name, ext = self._validate_text_file_name(file_name)
            finalize_file_name: Optional[str] = clean_name
        else:
            existing_doc = await self.get_document(doc_id)
            if not isinstance(existing_doc, dict) or existing_doc.get("error") or not existing_doc.get("name"):
                raise ValueError(f"Failed to retrieve existing document '{doc_id}' before version upload.")
            clean_name = str(existing_doc["name"]).strip()
            _, ext = os.path.splitext(clean_name)
            finalize_file_name = None

        if ext.lower() not in TEXT_CONTENT_TYPE_BY_EXTENSION:
            supported = ", ".join(sorted(TEXT_CONTENT_TYPE_BY_EXTENSION))
            raise ValueError(
                f"Unsupported text document extension '{ext or '<none>'}' for '{clean_name}'. "
                f"Supported extensions: {supported}. "
                "For binary or other file types, use request_version_upload + finalize_version_upload instead."
            )

        data, resolved_content_type = self._prepare_text_content(content, ext, content_type)
        req_res = await self.request_version_upload(
            document_id=doc_id,
            file_name=clean_name,
            file_size=len(data),
        )
        if not isinstance(req_res, dict) or req_res.get("error"):
            raise ValueError(f"Failed to request version upload URL for document '{doc_id}'.")

        upload_url = req_res.get("upload_url")
        storage_key = req_res.get("storage_key")
        if not upload_url or not storage_key:
            raise ValueError("Version upload request response missing required 'upload_url' or 'storage_key'.")

        await self._upload_bytes(
            upload_url=str(upload_url),
            data=data,
            content_type=resolved_content_type,
        )

        doc = await self.finalize_version_upload(
            document_id=doc_id,
            storage_key=str(storage_key),
            file_name=finalize_file_name,
            content_type=resolved_content_type,
        )
        return await self._apply_optional_description(doc, description)

    @staticmethod
    def _validate_read_document_ready(doc: Any, doc_id: str) -> dict[str, Any]:
        if not isinstance(doc, dict) or doc.get("error"):
            raise ValueError(f"Failed to retrieve document '{doc_id}'.")
        if doc.get("status") == "uploading":
            raise ValueError(f"Document '{doc_id}' is still uploading and not ready to read.")
        return doc

    @staticmethod
    def _resolve_readable_text_type(doc: dict[str, Any]) -> tuple[str, str]:
        versions = doc.get("versions")
        primary_name = ""
        if isinstance(versions, list):
            for version in versions:
                if isinstance(version, dict) and version.get("is_primary"):
                    primary_name = str(version.get("file_name") or "").strip()
                    break

        doc_name = str(doc.get("name") or "").strip()
        resolved_name = primary_name or doc_name

        candidates = [
            primary_name,
            doc_name,
            str(doc.get("original_storage_key") or "").strip(),
            str(doc.get("storage_key") or "").strip(),
        ]
        resolved_ext = ""
        for candidate in candidates:
            if not candidate:
                continue
            _, ext = os.path.splitext(candidate)
            if ext:
                resolved_ext = ext.lower()
                break

        if resolved_ext:
            if resolved_ext not in TEXT_CONTENT_TYPE_BY_EXTENSION:
                supported = ", ".join(sorted(TEXT_CONTENT_TYPE_BY_EXTENSION))
                raise ValueError(
                    f"Document '{resolved_name or doc.get('id')}' has unsupported extension '{resolved_ext}' for inline text reading. "
                    f"Supported extensions: {supported}. For binary files (PDF, Office, images, video), use get_document_download_url instead."
                )
            return resolved_name, TEXT_CONTENT_TYPE_BY_EXTENSION[resolved_ext]

        raw_content_type = str(doc.get("content_type") or "").strip().lower()
        if raw_content_type in set(TEXT_CONTENT_TYPE_BY_EXTENSION.values()):
            return resolved_name, raw_content_type

        if str(doc.get("type") or "").strip().lower() == "markdown":
            return resolved_name, "text/markdown"

        supported = ", ".join(sorted(TEXT_CONTENT_TYPE_BY_EXTENSION))
        raise ValueError(
            f"Document '{resolved_name or doc.get('id')}' is not a recognized text document. "
            f"Supported extensions: {supported}. For binary files, use get_document_download_url instead."
        )

    async def read_text_document(
        self,
        document_id: str,
        offset: int = 0,
        max_chars: int = DEFAULT_TEXT_READ_CHARS,
    ) -> dict[str, Any]:
        """Read UTF-8 text content from an existing text document into context with bounded streaming and pagination."""
        doc_id = _validate_resource_id(document_id, "document_id")
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValueError("offset must be a non-negative integer.")
        if isinstance(max_chars, bool) or not isinstance(max_chars, int) or not (1 <= max_chars <= MAX_TEXT_READ_CHARS):
            raise ValueError(f"max_chars must be an integer between 1 and {MAX_TEXT_READ_CHARS}.")

        doc = self._validate_read_document_ready(await self.get_document(doc_id), doc_id)
        resolved_name, resolved_content_type = self._resolve_readable_text_type(doc)

        raw_size = doc.get("file_size")
        if isinstance(raw_size, int) and not isinstance(raw_size, bool) and raw_size > MAX_TEXT_READ_BYTES:
            raise ValueError(
                f"Document exceeds maximum readable text size ({MAX_TEXT_READ_BYTES} bytes). "
                "Use get_document_download_url instead."
            )

        dl_res = await self._request("GET", f"/documents/{doc_id}/download/")
        download_url = dl_res.get("download_url") if isinstance(dl_res, dict) else None
        if not isinstance(dl_res, dict) or dl_res.get("error") or not download_url:
            raise ValueError(f"Failed to retrieve download URL for document '{doc_id}'.")

        raw_bytes = await self._download_bytes_bounded(str(download_url), MAX_TEXT_READ_BYTES)
        try:
            full_text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(
                f"Document '{resolved_name or doc_id}' is not valid UTF-8 text. "
                "Use get_document_download_url for binary files."
            ) from exc

        total_chars = len(full_text)
        chunk = full_text[offset : offset + max_chars]
        returned_chars = len(chunk)
        next_pos = offset + returned_chars
        truncated = next_pos < total_chars

        return {
            "document_id": str(doc.get("id") or doc_id),
            "name": str(doc.get("name") or resolved_name),
            "type": doc.get("type"),
            "content_type": resolved_content_type,
            "file_size": len(raw_bytes),
            "content": chunk,
            "offset": offset,
            "returned_chars": returned_chars,
            "total_chars": total_chars,
            "truncated": truncated,
            "next_offset": next_pos if truncated else None,
        }

    async def get_document_download_url(self, document_id: str) -> dict[str, Any]:
        """Retrieve a temporary signed external download URL for the primary version of a document."""
        doc_id = _validate_resource_id(document_id, "document_id")
        doc = self._validate_read_document_ready(await self.get_document(doc_id), doc_id)

        dl_res = await self._request("GET", f"/documents/{doc_id}/download/")
        download_url = dl_res.get("download_url") if isinstance(dl_res, dict) else None
        if not isinstance(dl_res, dict) or dl_res.get("error") or not download_url:
            raise ValueError(f"Failed to retrieve download URL for document '{doc_id}'.")

        return {
            "document_id": str(doc.get("id") or doc_id),
            "name": doc.get("name"),
            "type": doc.get("type"),
            "content_type": doc.get("content_type"),
            "file_size": doc.get("file_size"),
            "download_url": str(download_url),
        }

    @staticmethod
    def _with_api_error_hint(
        exc: ValueError,
        hint: str,
        *,
        match_substrings: tuple[str, ...] = ("(400)", "(404)"),
    ) -> ValueError:
        msg = str(exc)
        if any(token in msg for token in match_substrings):
            return ValueError(f"{msg} {hint}")
        return exc

    async def list_folders(self, parent_folder_id: Optional[str] = None) -> dict[str, Any]:
        endpoint = (
            f"/folders/{_validate_resource_id(parent_folder_id, 'parent_folder_id')}/"
            if parent_folder_id is not None
            else "/folders/"
        )
        res = await self._request("GET", endpoint)
        if not isinstance(res, dict) or res.get("error"):
            return res
        current = res.get("current_folder")
        raw_sub_folders = res.get("sub_folders")
        sub_folders: list[Any] = raw_sub_folders if isinstance(raw_sub_folders, list) else []
        raw_documents = res.get("documents")
        documents: list[Any] = raw_documents if isinstance(raw_documents, list) else []
        compact_folders = [
            {
                "id": f.get("id"),
                "name": f.get("name"),
                "parent": f.get("parent"),
            }
            for f in sub_folders
            if isinstance(f, dict)
        ]
        return {
            "current_folder": (
                {
                    "id": current.get("id"),
                    "name": current.get("name"),
                    "parent": current.get("parent"),
                }
                if isinstance(current, dict)
                else None
            ),
            "sub_folders": compact_folders,
            "total_folders": len(compact_folders),
            "documents_count": len(documents),
        }

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
        try:
            return await self._request("POST", "/actions/move/", json_data=payload)
        except ValueError as exc:
            raise self._with_api_error_hint(
                exc,
                "Verify destination_folder_id, document_ids, and folder_ids via list_folders and list_documents.",
            ) from exc

    # --- Datarooms API ---

    async def list_datarooms(
        self,
        page: int = 1,
        page_size: int = 20,
        name: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if name and name.strip():
            params["search"] = name.strip()
        res = await self._request("GET", "/datarooms/", params=params)
        if isinstance(res, dict) and res.get("error"):
            return res
        return self._paginate(res, page, page_size)

    async def get_dataroom(self, dataroom_id: str) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        return await self._request("GET", f"/datarooms/{dr_id}/")

    async def search_dataroom_content(self, dataroom_id: str, query: str) -> dict[str, Any]:
        dr_id = _validate_resource_id(dataroom_id, "dataroom_id")
        clean_query = query.strip()
        if not clean_query:
            return {"items": []}
        return await self._request("GET", f"/datarooms/{dr_id}/search/", params={"q": clean_query})

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
            payload["dataroom_document_ids"] = [_validate_resource_id(d, "dataroom_document_id") for d in doc_ids]
        if dataroom_folder_ids:
            payload["dataroom_folder_ids"] = [_validate_resource_id(f, "dataroom_folder_id") for f in dataroom_folder_ids]
        try:
            return await self._request("POST", f"/datarooms/{dr_id}/remove-content/", json_data=payload)
        except ValueError as exc:
            raise self._with_api_error_hint(
                exc,
                "Verify that dataroom_document_ids and dataroom_folder_ids come from get_dataroom(dataroom_id) "
                "or search_dataroom_content(dataroom_id) rather than workspace folder/document listings.",
            ) from exc

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
        try:
            return await self._request("POST", "/share-links/", json_data=data)
        except ValueError as exc:
            if "watermark" in str(exc).lower():
                raise self._with_api_error_hint(
                    exc,
                    "Dynamic watermarks are supported only on PDF, Office, and image documents, or datarooms.",
                    match_substrings=("(400)",),
                ) from exc
            raise

    async def update_share_link(self, share_link_id: str, data: dict[str, Any]) -> dict[str, Any]:
        sl_id = _validate_resource_id(share_link_id, "share_link_id")
        try:
            return await self._request("PATCH", f"/share-links/{sl_id}/", json_data=data)
        except ValueError as exc:
            if "watermark" in str(exc).lower():
                raise self._with_api_error_hint(
                    exc,
                    "Dynamic watermarks are supported only on PDF, Office, and image documents, or datarooms.",
                    match_substrings=("(400)",),
                ) from exc
            raise

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
