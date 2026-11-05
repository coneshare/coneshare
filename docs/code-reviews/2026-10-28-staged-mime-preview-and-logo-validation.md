# Code Review: Staged Fixes for Brand Logo Validation, Renderer MIME/Extension Filtering & Go Preview Security Headers

**Date:** 2026-10-28  
**Scope:** Staged files across `backend/` and `core/`:
- `backend/core/serializers.py`
- `backend/documents/renderers/markdown.py`
- `backend/documents/renderers/pdf.py`
- `backend/documents/renderers/utils.py`
- `backend/documents/views.py`
- `backend/tests/core/test_admin_views.py`
- `backend/tests/documents/test_renderers.py`
- `backend/tests/documents/test_views.py`
- `core/main.go`
- `core/main_test.go`

---

## Findings Summary

| # | Severity | Component / File | Description |
| :- | :---: | :--- | :--- |
| **1** | **HIGH** | `core/main.go:501-509` | **`dangerousInlineExtensions` Bypass When `info.Filename` and `filePath` Extensions Diverge**: `filepath.Ext(filePath)` is only checked when `downloadName` has no extension (`effectiveExt == ""`). Because `http.ServeFile` sets `Content-Type` from `filepath.Ext(filePath)` on disk, a token with `Filename: "image.png"` and `StorageKey: "org/ab/page.html"` bypasses `dangerousInlineExtensions` and serves `Content-Type: text/html` inline. |
| **2** | **HIGH** | `backend/documents/views.py:238-246`, `backend/documents/renderers/direct_image.py:21-48` | **Incomplete Extension / MIME Conflict Validation Across Finalize Endpoints & `DirectImageRenderer`**: Only `DocumentUploadFinalizeView` checks `unique_name` vs. `content_type`. `DocumentVersionUploadFinalizeView`, `DataroomViewSet.upload_finalize`, and `FileRequestUploadFinalizeView` are missing the check, `storage_key` extension is not compared against `unique_name`, and `DirectImageRenderer` does not reject mismatched extensions. |
| **3** | **MEDIUM** | `backend/core/models.py:70-75`, `backend/datarooms/serializers.py:182-210` | **Model Validator Mismatch on `Organization.brand_logo` & Missing Validation on `Dataroom.branding_banner`**: `Organization.brand_logo` model `FileExtensionValidator` still lists `['png', 'jpg', 'jpeg', 'svg']` (omitting `'webp'` and keeping `'svg'`). Additionally, `DataroomSerializer` lacks `validate_branding_banner` for the single-banner field, and `UserSerializer` lacks `validate_avatar`. |
| **4** | **LOW** | `backend/tests/core/test_admin_views.py`, `backend/tests/documents/test_renderers.py`, `backend/tests/documents/test_views.py`, `core/main_test.go` | **Test Style & Neutral Naming Policy**: `test_admin_views.py` uses inline imports (`io`, `PIL.Image`, `SimpleUploadedFile`) instead of head-of-file imports (`AGENTS.md`), and test fixtures use `"exploit.html"` / `"exploit.htm"` instead of neutral identifiers (`.agent/memory.md`). |

---

## Detailed Evaluation & Remediation

### 1. [HIGH] `dangerousInlineExtensions` Bypass in `core/main.go` (`handleDownload`)

In `core/main.go:501-509`:
```go
effectiveExt := strings.ToLower(filepath.Ext(downloadName))
if effectiveExt == "" {
    effectiveExt = strings.ToLower(filepath.Ext(filePath))
}

effectiveDisposition := disposition
if effectiveDisposition == "inline" && dangerousInlineExtensions[effectiveExt] {
    effectiveDisposition = "attachment"
}
```

#### Problem Mechanics
- `filepath.Ext(filePath)` is only evaluated when `downloadName` has no extension (`effectiveExt == ""`).
- Go's standard library `http.ServeFile(w, r, filePath)` determines the `Content-Type` response header from `filepath.Ext(filePath)` on disk (e.g., `.html` -> `Content-Type: text/html; charset=utf-8`), not from `downloadName`.
- If a token has `Filename: "image.png"` or `"document.pdf"` while `filePath` on disk ends in `.html` or `.svg`, `effectiveExt` evaluates to `".png"` / `".pdf"`, bypassing `dangerousInlineExtensions` and serving the active file with `Content-Disposition: inline`.

#### Required Remediation
Check **both** `downloadName` and `filePath` extensions against `dangerousInlineExtensions`:
```go
downloadExt := strings.ToLower(filepath.Ext(downloadName))
fileExt := strings.ToLower(filepath.Ext(filePath))

effectiveDisposition := disposition
if effectiveDisposition == "inline" && (dangerousInlineExtensions[downloadExt] || dangerousInlineExtensions[fileExt]) {
    effectiveDisposition = "attachment"
}
```

---

### 2. [HIGH] Incomplete Extension / MIME Conflict Validation Across Finalize Endpoints & `DirectImageRenderer`

In `backend/documents/views.py:238-246`:
```python
target_name = validated_data.get('unique_name', '')
client_content_type = validated_data.get('content_type', '')
ext = os.path.splitext(target_name)[1].lower()
if ext in ('.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.php', '.sh'):
    if client_content_type and client_content_type.lower() in ('text/markdown', 'application/pdf'):
        return Response(
            {"content_type": f"Declared content type '{client_content_type}' conflicts with file extension '{ext}'."},
            status=status.HTTP_400_BAD_REQUEST
        )
```

#### Problem Mechanics
1. **Missing on 3 of 4 Finalize Endpoints:**
   - `DocumentVersionUploadFinalizeView` (`backend/documents/views.py:540`)
   - `DataroomViewSet.upload_finalize` (`backend/datarooms/views.py:690`)
   - `FileRequestUploadFinalizeView` (`backend/filerequests/views.py:305`)
   All three bypass this check.
2. **`storage_key` Extension Not Validated Against `unique_name` / `document.name`:**
   - A client can request an upload for `file_name="page.html"` (receiving `storage_key="<org_id>/ab/cd.html"`), upload HTML content, and then call `finalize` with `storage_key="<org_id>/ab/cd.html"`, `unique_name="readme.md"` (or `"image.png"`), and `content_type="text/markdown"` (or `"image/png"`). `DocumentUploadFinalizeView` only inspects `unique_name`, not `storage_key`.
   - In `create_new_document_version` (`backend/documents/services.py:699-741`), `normalize_content_type(content_type, document.name)` and `_route_document_for_processing` only inspect `document.name`, ignoring the new version's `storage_key` extension.
3. **`DirectImageRenderer` Lacks Extension Mismatch Guard:**
   - Unlike `PDFRenderer` and `MarkdownRenderer`, `DirectImageRenderer.can_handle_file` and `DirectImageRenderer.can_handle_version` (`backend/documents/renderers/direct_image.py:21-48`) do not reject files when `filename` or `storage_key` has an extension outside `DIRECT_IMAGE_EXTENSIONS`. If a file has `storage_key=".../page.html"` and `unique_name="pic.png"` (or an extension outside the 9-extension blocklist such as `.shtml` or `.mhtml` with `content_type="image/png"`), `DirectImageRenderer` classifies it as an image and serves `original_storage_key` directly as page 1.

#### Required Remediation
1. Extract a shared validator in `backend/documents/services.py` (invoked across `create_document_from_upload`, `create_new_document_version`, and all 4 finalize views) that checks both `unique_name`/`document.name` and `storage_key` extensions and ensures `storage_key` extension consistency.
2. In `DirectImageRenderer.can_handle_file` and `DirectImageRenderer.can_handle_version`, reject any non-empty `filename` or `storage_key` extension not in `DIRECT_IMAGE_EXTENSIONS`:
   ```python
   if filename:
       ext = os.path.splitext(filename)[1].lower()
       if ext and ext not in DIRECT_IMAGE_EXTENSIONS:
           return False
   if storage_key:
       ext = os.path.splitext(storage_key)[1].lower()
       if ext and ext not in DIRECT_IMAGE_EXTENSIONS:
           return False
   ```

---

### 3. [MEDIUM] Model Validator Mismatch on `Organization.brand_logo` & Missing Validation on `Dataroom.branding_banner`

1. **`Organization.brand_logo` (`backend/core/models.py:70-75`):**
   - `OrganizationSerializer.validate_brand_logo` allows `['png', 'jpg', 'jpeg', 'webp']` and rejects `'svg'`, but `Organization.brand_logo` on the model still defines `validators=[FileExtensionValidator(allowed_extensions=['png', 'jpg', 'jpeg', 'svg'])]`. Calling `full_clean()` on an `Organization` with a `.webp` logo fails validation, while model validation still permits `.svg`.
2. **`Dataroom.branding_banner` (`backend/datarooms/serializers.py`) & `User.avatar` (`backend/core/serializers.py`):**
   - While `DataroomSerializer` validates `brand_logo_override` and `DataroomBannerImageSerializer` validates gallery `image` (`MAX_BANNER_IMAGE_SIZE_BYTES = 5 MB` and `PNG`/`JPEG`/`WEBP` format verification), `DataroomSerializer` has no `validate_branding_banner` for the single-banner field (`branding_banner`), and `UserSerializer` has no size/format validator on `avatar`.

#### Required Remediation
- Update `FileExtensionValidator` on `Organization.brand_logo` in `backend/core/models.py` to `['png', 'jpg', 'jpeg', 'webp']`.
- Add `validate_branding_banner` to `DataroomSerializer` and `validate_avatar` to `UserSerializer`.

---

### 4. [LOW] Test Style & Neutral Naming Policy Violations

1. **Inline Imports (`backend/tests/core/test_admin_views.py:184, 195-197`):**
   - Move `import io`, `from PIL import Image`, and `from django.core.files.uploadedfile import SimpleUploadedFile` to the top of `backend/tests/core/test_admin_views.py` per `AGENTS.md`.
2. **Non-Neutral Fixture Names (`backend/tests/documents/test_renderers.py:111-114`, `backend/tests/documents/test_views.py:2812-2814`, `core/main_test.go:391`):**
   - Replace `"exploit.html"` and `"exploit.htm"` with neutral identifiers such as `"page.html"`, `"page.htm"`, and `"vector.svg"` per `.agent/memory.md` ([2026-10-25] Neutral Testing & Documentation Standards).

---

## Proposed Additions to Long-Term Memory

```markdown
# Proposed Additions to Long-Term Memory
[ ] Issue: `DocumentUploadFinalizeView` validated extension vs. `content_type` conflicts only on `unique_name` in one view, omitting `DocumentVersionUploadFinalizeView`, `DataroomViewSet.upload_finalize`, `FileRequestUploadFinalizeView`, `DirectImageRenderer`, and `storage_key` extension consistency. Additionally, `core/main.go:handleDownload` only checked `filepath.Ext(filePath)` against `dangerousInlineExtensions` when `downloadName` had no extension.
Prevention Rule: Enforce upload MIME/extension and `storage_key` extension validation centrally across all 4 upload finalize flows (`documents`, `versions`, `datarooms`, `filerequests`) and all preview renderers (including `DirectImageRenderer`). In `core/main.go`, always check both `downloadName` and `filePath` extensions when enforcing `Content-Disposition: attachment` for active content types.
```
