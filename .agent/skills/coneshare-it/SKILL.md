---
name: coneshare-it
version: 1.0.0
description: Standard operational workflows, sensible defaults, zero-friction uploading, link sharing, and analytics via Coneshare MCP.
---

# Coneshare-It Skill Guide (v1.0.0)

## 1. Core Operational Rule: Sensible Defaults + Proactive Notice
Always prioritize **zero-friction execution**. Execute user requests instantly using sensible defaults, present the result, and offer a proactive notice for optional security or configuration tweaks.

---

## 2. Document Upload & Link Sharing Workflow
- **Standard 2-Step Presigned Upload Flow**: All document uploads use `request_document_upload` (returns `upload_url` and `storage_key`) -> HTTP binary stream `PUT` -> `finalize_document_upload`.
- **Streaming Uploads**: Handles files from 1 KB through 10 GB without Base64 buffering on the MCP server.

---

## 3. Upload & Sharing Rules

### Scenario A: Single File Upload
- Upload the file via the 2-step presigned upload flow.
- Automatically create an open share link with downloads and email view notifications enabled (`create_share_link(document_id=..., allow_download=True, receive_email_notification=True)`).
- Return the `url` property directly from `create_share_link` and present a proactive notice (*"Downloads and email view notifications enabled. Let me know if you'd like to add a password, expiration date, dynamic watermark, or NDA sign-off!"*).

### Scenario B: Multiple Files Upload
- Upload all files via the 2-step presigned upload flow.
- **Do not generate individual share links per file**.
- Check existing datarooms (`list_datarooms`) and prompt the user:
  1. **Create a new Dataroom** for these files.
  2. **Add the uploaded files** to an existing Dataroom.
  3. **Keep the files in private workspace documents** (no public share link).
- Once selected, generate **1 single share link** for the Dataroom (`create_share_link(dataroom_id=...)`) if shared.

### Batch Upload Guardrail (Max 50 Files)
- **Batch Limit**: Do not attempt to upload more than **50 files** in a single multi-file upload action.
- **Limit Exceeded Action**: If a directory/batch contains > 50 files, pause execution before uploading and advise the user to compress the folder into a `.zip` archive or select a subfolder/subset of key files.

### Updates & Modifications
- Modify active link parameters anytime using `update_share_link`.

---

## 4. Analytics & View Tracking Workflow
- **Token Efficiency**: Use `list_view_sessions` for lightweight session summaries.
- **Granular Analysis**: Call `get_view_session` when the user requests detailed page-by-page view durations or video engagement event logs.

---

## 5. Error Handling & Circuit Breaker Rule
- **Stop-on-Error**: If any step in a multi-tool chain (e.g. `request_document_upload`, `finalize_document_upload`) returns an error object (`{"error": true, ...}`), **HALT IMMEDIATELY**.
- **Partial-Batch Failure Policy**: In a multi-file upload, if file N fails after earlier files finalize, halt downstream share link generation per the stop-on-error rule, and report both the successfully finalized document IDs and the failed file details to the user.
- **No Orphaned Calls**: Never invoke downstream tools (such as `create_share_link`) if an upstream prerequisite step failed. Report the error detail directly to the user.

---

## 6. Version History
- **`v1.0.0`**: Initial release — 2-step streaming uploads, single vs multi-file Dataroom prompt policies, 50-file batch guardrail, default watermark resolution, and circuit breaker rules.
