---
name: coneshare-it
version: 2.0.0
description: Standard operational workflows, sensible defaults, zero-friction uploading, link sharing, and analytics via Coneshare MCP.
---

# Coneshare-It Skill Guide (v2.0.0)

## 1. Core Operational Rule: Sensible Defaults + Proactive Notice
Always prioritize **zero-friction execution**. Execute user requests instantly using sensible defaults, present the result, and offer a proactive notice for optional security or configuration tweaks.

---

## 2. Document Upload & Link Sharing Workflow
- **Standard 2-Step Presigned Upload Flow**: All binary/local document uploads use `request_document_upload` (returns `upload_url` and `storage_key`) -> HTTP binary stream `PUT` -> `finalize_document_upload`.
- **Streaming Uploads**: Handles files from 1 KB through 10 GB without Base64 buffering on the MCP server.

---

## 3. Upload & Sharing Rules

### Scenario A: Single File Upload
- Upload the file via the 2-step presigned upload flow (or `create_text_document` for in-memory Markdown/CSV/plain text).
- Automatically create an open share link with downloads and email view notifications enabled (`create_share_link(document_id=..., allow_download=True, receive_email_notification=True)`).
- Return the `url` property directly from `create_share_link` and present a proactive notice (*"Downloads and email view notifications enabled. Let me know if you'd like to add a password, expiration date, dynamic watermark, or NDA sign-off!"*).

### Scenario B: Multiple Files Upload
- Upload all files via the 2-step presigned upload flow.
- **Do not generate individual share links per file**.
- Check existing datarooms (`list_datarooms`) and prompt the user:
  1. **Create a new Dataroom** for these files.
  2. **Add the uploaded files** to an existing Dataroom (`add_content_to_dataroom`).
  3. **Keep the files in private workspace documents** (no public share link).
- Once selected, generate **1 single share link** for the Dataroom (`create_share_link(dataroom_id=...)`) if shared.

### Batch Upload Guardrail (Max 50 Files)
- **Batch Limit**: Do not attempt to upload more than **50 files** in a single multi-file upload action.
- **Limit Exceeded Action**: If a directory/batch contains > 50 files, pause execution before uploading and advise the user to compress the folder into a `.zip` archive or select a subfolder/subset of key files.

### Navigation, Metadata & Updates
- **Folder Discovery**: Use `list_folders(parent_folder_id=...)` to inspect workspace subfolder ULIDs before calling `list_documents(folder_id=...)` or `move_items`.
- **Metadata vs Content**: Use `get_document_metadata(document_id=...)` for versions/share links (and check `next_step_hint`) and `update_document_metadata(document_id=..., name=..., description=...)` to rename or update descriptions without altering file contents.
- **Dataroom Content Removal**: Use `get_dataroom` or `search_dataroom_content` first to obtain `dataroom_document_ids` / `dataroom_folder_ids` before calling `remove_content_from_dataroom`.
- **Read -> Edit -> Update existing document content (keep existing share links)**:
  - To inspect an existing text/Markdown/CSV/JSON/YAML document first, call `read_text_document(document_id=...)` (for binary files like PDF/Office/video, use `get_document_download_url(document_id=...)`).
  - **Retrieve all pages before replacing**: `update_text_document` uploads a complete replacement version. If `read_text_document` returns `truncated: true`, follow `next_offset` (`read_text_document(document_id=..., offset=next_offset)`) until `truncated` is `false`, concatenate all pages, and only then edit and submit the complete text (single-page documents where `truncated` is `false` need no extra call). If any page request fails, **halt immediately** and do **not** call `update_text_document`.
  - For Markdown/CSV/text content in context: use `update_text_document(document_id=..., content=...)`.
  - For local/binary files: use the 2-step version upload flow (`request_version_upload(document_id=..., file_name=..., file_size=...)` -> HTTP `PUT` -> `finalize_version_upload(document_id=..., storage_key=...)`).
  - Do **not** use `request_document_upload` or `create_text_document` when updating an existing document—those create a separate document with `(1)`/`(2)` suffix and leave existing share links pointing to the old file.
- **Modify link settings**: Update active link parameters anytime using `update_share_link`.

---

## 4. Analytics & View Tracking Workflow
- **Token Efficiency**: Use `list_view_sessions` for lightweight session summaries (requires API key; blocked under OAuth 2.1).
- **Granular Analysis**: Call `get_view_session` when the user requests detailed page-by-page view durations or video engagement event logs (requires API key).

---

## 5. Toolsets & Opt-In Groups
- Default MCP connections expose **32 tools** as the API-key baseline (`admin` tools excluded by default), or **26 tools** under OAuth 2.1 (`read` + `write`, which also hides `destructive` and `viewer_analytics` tools).
- Organization admins using API keys can enable `list_admin_users`, `get_admin_user_details`, and `list_login_activities` by reconnecting with `?toolsets=admin` or header `X-Coneshare-Toolsets: admin`.
- Clients on strict tool budgets can pass `?toolsets=core` (or `X-Coneshare-Toolsets: core`) for the slim **24-tool** API-key preset (or **22 tools** under OAuth 2.1), excluding folder management and destructive tools.

---

## 6. Error Handling & Circuit Breaker Rule
- **Stop-on-Error**: If any step in a multi-tool chain (e.g. `request_document_upload`, `finalize_document_upload`, `read_text_document`) fails—either returning a FastMCP tool error (`isError: true`) or an error payload (`{"error": true, ...}`)—**HALT IMMEDIATELY**.
- **Partial-Batch Failure Policy**: In a multi-file upload, if file N fails after earlier files finalize, halt downstream share link generation per the stop-on-error rule, and report both the successfully finalized document IDs and the failed file details to the user.
- **No Orphaned Calls**: Never invoke downstream tools (such as `create_share_link`) if an upstream prerequisite step failed. Report the error detail directly to the user.

---

## 7. Version History
- **`v2.0.0`**: Align with `coneshare-mcp` v1.0.0 — renamed `get_document_metadata`, `update_document_metadata`, `remove_content_from_dataroom` parameters (`dataroom_document_ids`, `dataroom_folder_ids`), added `list_folders`, documented `?toolsets=admin` / `?toolsets=core` presets, and aligned circuit-breaker wording with FastMCP tool errors.
- **`v1.0.0`**: Initial release — 2-step streaming uploads, single vs multi-file Dataroom prompt policies, 50-file batch guardrail, default watermark resolution, and circuit breaker rules.
