---
name: coneshare-it
description: Standard operational workflows, sensible defaults, zero-friction uploading, link sharing, and analytics via Coneshare MCP.
---

# Coneshare-It Skill Guide

## 1. Core Operational Rule: Sensible Defaults + Proactive Notice
Always prioritize **zero-friction execution**. Execute user requests instantly using sensible defaults, present the result, and offer a proactive notice for optional security or configuration tweaks.

---

## 2. Document Upload Workflow
- **Standard 2-Step Presigned Upload Flow**: All document uploads use `request_document_upload` (returns `upload_url` and `storage_key`) -> HTTP binary stream `PUT` -> `finalize_document_upload`.
- **Zero Memory Overhead**: Handles files of any size (1 KB to 10 GB) with zero Base64 buffer overhead on the MCP server.

---

## 3. Link Sharing Workflow
- **Default Action**: Create an open share link with downloads enabled (`allow_download=True`).
- **Share Link URL**: Always use the returned `url` property directly from the tool response (e.g., `create_share_link`).
- **Proactive Notice**: Display the returned share URL and remind the user of available security options (*"Downloads enabled. Let me know if you'd like to add a password, expiration date, dynamic watermark, or NDA sign-off!"*).
- **Updates**: Modify active link parameters anytime using `update_share_link`.

---

## 4. Analytics & View Tracking Workflow
- **Token Efficiency**: Use `list_view_sessions` for lightweight session summaries.
- **Granular Analysis**: Call `get_view_session` when the user requests detailed page-by-page view durations or video engagement event logs.

---

## 5. Error Handling & Circuit Breaker Rule
- **Stop-on-Error**: If any step in a multi-tool chain (e.g. `request_document_upload`, `finalize_document_upload`) returns an error object (`{"error": true, ...}`), **HALT IMMEDIATELY**.
- **No Orphaned Calls**: Never invoke downstream tools (such as `create_share_link`) if an upstream prerequisite step failed. Report the error detail directly to the user.
