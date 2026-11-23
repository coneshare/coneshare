"""Generate curated public OpenAPI spec and UI catalog for ConeShare portal."""

from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

import yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2] if len(sys.argv) < 4 else pathlib.Path(".")
SOURCE_YAML = pathlib.Path(
    sys.argv[1] if len(sys.argv) > 1 else REPO_ROOT / "backend/docs/api/openapi.yaml"
)
PUBLIC_SPEC_OUT = pathlib.Path(
    sys.argv[2] if len(sys.argv) > 2 else REPO_ROOT / "portal/public/openapi.json"
)
UI_CATALOG_OUT = pathlib.Path(
    sys.argv[3] if len(sys.argv) > 3 else REPO_ROOT / "portal/lib/openapi-public.json"
)

CATEGORY_DEFS = [
    {
        "id": "documents",
        "titleEn": "Documents & Folders",
        "titleZh": "文档与文件夹",
        "descriptionEn": "Upload documents, inspect preview status and versions, and organize folders.",
        "descriptionZh": "上传文档、查询预览处理状态与历史版本，以及管理工作区目录树。",
    },
    {
        "id": "datarooms",
        "titleEn": "Virtual Datarooms",
        "titleZh": "虚拟资料室 (VDR)",
        "descriptionEn": "Create datarooms, organize content trees, manage collaborators, and set banners.",
        "descriptionZh": "创建资料室、添加或移动内容树、管理协作成员及配置自定义横幅。",
    },
    {
        "id": "share-links",
        "titleEn": "Share Links & Q&A",
        "titleZh": "分享链接与 Q&A",
        "descriptionEn": "Create controlled share links, presets, and answer dataroom Q&A threads.",
        "descriptionZh": "生成带密码、有效期、水印策略的分享链接，并管理资料室 Q&A 问答线索。",
    },
    {
        "id": "analytics",
        "titleEn": "Analytics & View Sessions",
        "titleZh": "阅读分析与访客会话",
        "descriptionEn": "Query engagement summaries, daily visit trends, visitor records, and session logs.",
        "descriptionZh": "获取阅读概览统计、每日访问趋势、访客档案与逐次访问会话日志。",
    },
    {
        "id": "file-requests",
        "titleEn": "File Requests",
        "titleZh": "文件收集 (File Request)",
        "descriptionEn": "Create secure upload intake links, export submissions, and integrate custom uploaders.",
        "descriptionZh": "创建对外文件收集链接、导出已收文件并对接自定义直传表单流程。",
    },
    {
        "id": "automations",
        "titleEn": "Automations & Webhooks",
        "titleZh": "自动化与 Webhook",
        "descriptionEn": "Configure webhook destinations, event automation rules, and inspect or replay deliveries.",
        "descriptionZh": "管理 Webhook 目标端、配置事件触发规则，并查看或重放推送投递记录。",
    },
    {
        "id": "cloud",
        "titleEn": "Cloud Storage Imports",
        "titleZh": "云存储导入",
        "descriptionEn": "List active cloud storage connections and launch asynchronous file imports.",
        "descriptionZh": "查询已授权的 Google Drive / Dropbox / Nextcloud 连接并发起异步文件导入。",
    },
    {
        "id": "api-keys-trash",
        "titleEn": "API Keys & Trash",
        "titleZh": "API Key 与回收站",
        "descriptionEn": "Manage API keys programmatically and restore or purge deleted items in trash.",
        "descriptionZh": "查询或创建 API Key，以及恢复或永久清理回收站中的文档和目录。",
    },
]

EXCLUDED_PREFIXES = (
    "/api/schema/",
    "/api/v1/admin/",
    "/api/v1/_health/",
    "/api/v1/languages/",
    "/api/v1/public/settings/",
    "/api/v1/signup/",
    "/api/v1/token/",
    "/api/v1/logout/",
    "/api/v1/users",
    "/api/v1/organizations",
    "/api/v1/links/",
    "/api/v1/link-clicks/",
    "/api/v1/page-views/",
    "/api/v1/cloud/connect/",
    "/api/v1/cloud/callback/",
)

EXCLUDED_EXACT = {
    "/api/v1/view-sessions/{id}/record-visit/",
    "/api/v1/share-links/{id}/preview/",
}

EXCLUDED_OPERATIONS = {
    ("/api/v1/view-sessions/", "post"),
}

FULL_ACCESS_POST_PATHS = {
    "/api/v1/datarooms/{id}/remove-content/",
    "/api/v1/datarooms/{id}/collaborators/{user_id}/",
    "/api/v1/datarooms/{id}/transfer-ownership/",
}

HTTP_METHODS = ("get", "post", "patch", "put", "delete")


def is_public_path(path: str) -> bool:
    if path in EXCLUDED_EXACT:
        return False
    return not any(path.startswith(prefix) for prefix in EXCLUDED_PREFIXES)


def categorize_path(path: str) -> str | None:
    if (
        path.startswith("/api/v1/documents")
        or path.startswith("/api/v1/folders")
        or path.startswith("/api/v1/uploads/document")
        or path == "/api/v1/actions/move/"
    ):
        return "documents"
    if (
        path.startswith("/api/v1/datarooms")
        or path.startswith("/api/v1/dataroom-folders")
        or path.startswith("/api/v1/dataroom-documents")
    ):
        return "datarooms"
    if (
        path.startswith("/api/v1/share-links")
        or path.startswith("/api/v1/share-link-templates")
        or path.startswith("/api/v1/qna-threads")
    ):
        return "share-links"
    if (
        path.startswith("/api/v1/analytics")
        or path.startswith("/api/v1/view-sessions")
        or path.startswith("/api/v1/viewers")
    ):
        return "analytics"
    if path.startswith("/api/v1/file-requests") or path.startswith("/api/v1/public/file-requests"):
        return "file-requests"
    if path.startswith("/api/v1/automation"):
        return "automations"
    if path.startswith("/api/v1/cloud/"):
        return "cloud"
    if path.startswith("/api/v1/trash") or path.startswith("/api/v1/api-keys"):
        return "api-keys-trash"
    return None


def compute_tier_hint(path: str, method: str, op: dict[str, Any]) -> str:
    security = op.get("security")
    if path.startswith("/api/v1/public/"):
        return "public"
    if security is not None and {} in security and not any("apiKeyAuth" in s for s in security if isinstance(s, dict)):
        return "public"
    m = method.lower()
    if m in ("get", "head", "options"):
        return "read_only"
    if m == "delete":
        return "full_access"
    if path in FULL_ACCESS_POST_PATHS:
        return "full_access"
    if path.startswith("/api/v1/api-keys") and m != "get":
        return "full_access"
    return "read_write"


def resolve_schema(schema: Any, schemas: dict[str, Any], seen: set[str] | None = None) -> dict[str, Any]:
    if not isinstance(schema, dict):
        return {}
    seen = seen or set()
    if "$ref" in schema:
        ref_name = schema["$ref"].split("/")[-1]
        if ref_name in seen:
            return {"type": "object"}
        target = schemas.get(ref_name, {})
        resolved = resolve_schema(target, schemas, seen | {ref_name})
        merged = {**resolved, **{k: v for k, v in schema.items() if k != "$ref"}}
        return merged
    if "allOf" in schema and isinstance(schema["allOf"], list):
        merged: dict[str, Any] = {}
        props: dict[str, Any] = {}
        req: list[str] = []
        for sub in schema["allOf"]:
            r = resolve_schema(sub, schemas, seen)
            merged.update({k: v for k, v in r.items() if k not in ("properties", "required")})
            props.update(r.get("properties", {}))
            req.extend(r.get("required", []))
        if props:
            merged["properties"] = props
        if req:
            merged["required"] = list(dict.fromkeys(req))
        return merged
    return schema


def format_type(schema: dict[str, Any], schemas: dict[str, Any]) -> str:
    resolved = resolve_schema(schema, schemas)
    t = resolved.get("type")
    fmt = resolved.get("format")
    if "enum" in resolved:
        vals = [str(v) for v in resolved["enum"][:5]]
        suffix = ", ..." if len(resolved["enum"]) > 5 else ""
        return f"enum ({', '.join(vals)}{suffix})"
    if t == "array":
        item_type = format_type(resolved.get("items", {}), schemas)
        return f"array<{item_type}>"
    if not t and resolved.get("properties"):
        t = "object"
    if fmt and t == "string":
        return f"string ({fmt})"
    return t or "any"


def build_sample_value(schema: dict[str, Any], schemas: dict[str, Any], depth: int = 0) -> Any:
    if depth > 2:
        return {}
    resolved = resolve_schema(schema, schemas)
    if "example" in resolved:
        return resolved["example"]
    if "default" in resolved:
        return resolved["default"]
    if "enum" in resolved and resolved["enum"]:
        return resolved["enum"][0]
    t = resolved.get("type")
    fmt = resolved.get("format")
    if t == "string":
        if fmt == "uuid":
            return "550e8400-e29b-41d4-a716-446655440000"
        if fmt == "date-time":
            return "2026-11-23T12:00:00Z"
        if fmt == "email":
            return "reviewer@example.com"
        if fmt == "uri":
            return "https://example.com/webhook"
        return "string"
    if t == "integer":
        return 1
    if t == "number":
        return 1.0
    if t == "boolean":
        return True
    if t == "array":
        item = build_sample_value(resolved.get("items", {}), schemas, depth + 1)
        return [item]
    if t == "object" or "properties" in resolved:
        props = resolved.get("properties", {})
        sample: dict[str, Any] = {}
        for k, prop_schema in list(props.items())[:8]:
            prop_res = resolve_schema(prop_schema, schemas)
            if prop_res.get("readOnly"):
                continue
            sample[k] = build_sample_value(prop_res, schemas, depth + 1)
        return sample
    return None


def extract_fields(schema: dict[str, Any], schemas: dict[str, Any]) -> list[dict[str, Any]]:
    resolved = resolve_schema(schema, schemas)
    props = resolved.get("properties", {})
    required_set = set(resolved.get("required", []))
    fields = []
    for name, raw_prop in props.items():
        prop = resolve_schema(raw_prop, schemas)
        if prop.get("readOnly"):
            continue
        fields.append(
            {
                "name": name,
                "type": format_type(prop, schemas),
                "required": name in required_set,
                "nullable": bool(prop.get("nullable")),
                "description": (prop.get("description") or "").strip(),
            }
        )
    return fields


def humanize_operation(method: str, path: str, op: dict[str, Any]) -> str:
    if op.get("summary"):
        return op["summary"].strip()
    op_id = op.get("operationId", "")
    if op_id:
        clean = re.sub(r"^(api_v1_|v1_)", "", op_id)
        verb_map = [
            ("_partial_update", "Update"),
            ("_retrieve", "Get"),
            ("_list", "List"),
            ("_create", "Create"),
            ("_update", "Replace"),
            ("_destroy", "Delete"),
        ]
        for suffix, verb in verb_map:
            if clean.endswith(suffix):
                noun = clean[: -len(suffix)].replace("_", " ").strip()
                return f"{verb} {noun}" if noun else verb
        words = clean.replace("_", " ").strip()
        return words[:1].upper() + words[1:] if words else f"{method.upper()} {path}"
    return f"{method.upper()} {path}"


def collect_refs(obj: Any, found: set[str]) -> None:
    if isinstance(obj, dict):
        if "$ref" in obj and isinstance(obj["$ref"], str):
            found.add(obj["$ref"].split("/")[-1])
        for v in obj.values():
            collect_refs(v, found)
    elif isinstance(obj, list):
        for item in obj:
            collect_refs(item, found)


def main() -> None:
    spec = yaml.safe_load(SOURCE_YAML.read_text(encoding="utf-8"))
    all_schemas = spec.get("components", {}).get("schemas", {})
    raw_paths = spec.get("paths", {})

    public_paths: dict[str, Any] = {}
    grouped_endpoints: dict[str, list[dict[str, Any]]] = {c["id"]: [] for c in CATEGORY_DEFS}

    for path in sorted(raw_paths):
        if not is_public_path(path):
            continue
        cat_id = categorize_path(path)
        if not cat_id:
            continue

        path_item = raw_paths[path]
        filtered_path_item: dict[str, Any] = {}

        for method in HTTP_METHODS:
            if method not in path_item:
                continue
            if (path, method) in EXCLUDED_OPERATIONS:
                continue
            op = dict(path_item[method])

            # Keep public endpoints cleanly authenticated with apiKeyAuth in published spec
            if path.startswith("/api/v1/public/"):
                op["security"] = [{}]
            else:
                op["security"] = [{"apiKeyAuth": []}]

            filtered_path_item[method] = op

            # Skip redundant PUT when PATCH exists in UI catalog (keep in openapi.json)
            if method == "put" and "patch" in path_item:
                continue

            params = []
            for p in op.get("parameters", []):
                params.append(
                    {
                        "name": p.get("name"),
                        "in": p.get("in"),
                        "required": bool(p.get("required")),
                        "type": format_type(p.get("schema", {}), all_schemas),
                        "description": (p.get("description") or "").strip(),
                    }
                )

            req_fields: list[dict[str, Any]] = []
            sample_body: Any = None
            req_body = op.get("requestBody", {})
            content = req_body.get("content", {})
            json_media = content.get("application/json") or content.get("multipart/form-data")
            if isinstance(json_media, dict) and "schema" in json_media:
                req_fields = extract_fields(json_media["schema"], all_schemas)
                sample_body = build_sample_value(json_media["schema"], all_schemas)

            responses = []
            for status_code, resp in (op.get("responses") or {}).items():
                responses.append(
                    {
                        "status": str(status_code),
                        "description": (resp.get("description") or "").strip() or "Response",
                    }
                )

            op_id = op.get("operationId") or f"{method}_{path}"
            slug_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", op_id).strip("-").lower()

            grouped_endpoints[cat_id].append(
                {
                    "id": slug_id,
                    "operationId": op_id,
                    "method": method.upper(),
                    "path": path,
                    "summary": humanize_operation(method, path, op),
                    "description": (op.get("description") or "").strip(),
                    "tierHint": compute_tier_hint(path, method, path_item[method]),
                    "parameters": params,
                    "requestBodyRequired": bool(req_body.get("required")),
                    "requestBodyFields": req_fields,
                    "sampleRequestBody": sample_body if sample_body not in ({}, None) else None,
                    "responses": responses,
                }
            )

        if filtered_path_item:
            public_paths[path] = filtered_path_item

    # Collect transitively referenced component schemas for public/openapi.json
    needed_schemas: set[str] = set()
    collect_refs(public_paths, needed_schemas)
    queue = list(needed_schemas)
    while queue:
        name = queue.pop()
        if name in all_schemas:
            found: set[str] = set()
            collect_refs(all_schemas[name], found)
            for dep in found:
                if dep not in needed_schemas:
                    needed_schemas.add(dep)
                    queue.append(dep)

    filtered_schemas = {k: all_schemas[k] for k in sorted(needed_schemas) if k in all_schemas}

    public_openapi = {
        "openapi": spec.get("openapi", "3.0.3"),
        "info": {
            "title": "Coneshare Public API",
            "version": spec.get("info", {}).get("version", "1.11.0"),
            "description": (
                "Programmatic REST API for documents, folders, virtual datarooms, share links, "
                "engagement analytics, file requests, and workflow automations."
            ),
        },
        "servers": [
            {
                "url": "https://app.coneshare.com",
                "description": "Coneshare Cloud (replace with your self-hosted SITE_DOMAIN)",
            }
        ],
        "paths": public_paths,
        "components": {
            "schemas": filtered_schemas,
            "securitySchemes": {
                "apiKeyAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "API Key (cs_live_...)",
                    "description": "Authenticate using an API key header: Authorization: Bearer cs_live_<your_key>",
                }
            },
        },
    }

    ui_catalog = {
        "version": public_openapi["info"]["version"],
        "baseUrl": "https://app.coneshare.com",
        "totalPaths": len(public_paths),
        "totalOperations": sum(len(items) for items in grouped_endpoints.values()),
        "categories": [
            {**cat, "endpoints": grouped_endpoints[cat["id"]]}
            for cat in CATEGORY_DEFS
            if grouped_endpoints[cat["id"]]
        ],
    }

    PUBLIC_SPEC_OUT.parent.mkdir(parents=True, exist_ok=True)
    UI_CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)

    PUBLIC_SPEC_OUT.write_text(json.dumps(public_openapi, indent=2) + "\n", encoding="utf-8")
    UI_CATALOG_OUT.write_text(json.dumps(ui_catalog, indent=2) + "\n", encoding="utf-8")

    print(
        f"Generated {PUBLIC_SPEC_OUT} ({len(public_paths)} paths, {len(filtered_schemas)} schemas) "
        f"and {UI_CATALOG_OUT} ({ui_catalog['totalOperations']} UI endpoints)"
    )


if __name__ == "__main__":
    main()
