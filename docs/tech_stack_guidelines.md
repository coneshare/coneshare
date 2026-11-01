# Long-Term Project Lessons & Error Log

## Historical Review Failures & Fixes
<!-- The code-reviewer skill will append new lessons below this line -->

---

### [2026-07-09] Review of `4b986a0` — Document Version List/Restore

#### Rule 1: Always acquire `select_for_update()` before quota-sensitive reads
- **Issue:** `promote_document_version` read `old_file_size` from the un-locked `document` argument before `select_for_update()` was acquired, creating a quota-check race condition under concurrent requests.
- **Prevention Rule:** Always acquire the `select_for_update()` lock first, then read all concurrency-sensitive fields (e.g. `file_size`, `status`) from the locked object (`locked_doc`), not from the function argument. Quota checks that compare old vs. new values must happen inside `transaction.atomic()` after the lock.

#### Rule 2: Never expose raw `metadata` JSONFields in public list serializers
- **Issue:** `DocumentVersionListSerializer` included the raw `metadata` JSONField, which stores cloud provider internals (`connection_id`, `etag_or_rev`) from `plans/cloud-import-enhancements.md`. `connection_id` is a foreign key to OAuth-bearing `CloudConnection` records — a potential IDOR vector.
- **Prevention Rule:** Never include JSONFields that store cloud provider internals in public-facing list or detail serializers. Either exclude them entirely, or expose only a filtered, display-safe subset via a `SerializerMethodField` (e.g. `provider_display` only).

#### Rule 3: Guard no-op or invalid state-change transitions + write failing test first (TDD)
- **Issue:** Promoting an already-primary version was not blocked, violating the plan's acceptance criteria ("cannot be promoted again"). No test existed for this boundary.
- **Prevention Rule:** When implementing any state-change action (promote, activate, publish, restore), add an early guard that explicitly rejects no-op or invalid transitions with a `ValidationError`. Per project TDD policy: write the failing unit test first to confirm the bug, then add the guard to make it pass.

---

### [2026-07-14] Review of `6a33248` — Cloud Provider Disconnect

#### Rule 4: Never send OAuth tokens in URL query params during revocation calls
- **Issue:** `GoogleDriveProvider.revoke_token()` passed the OAuth token via `params={"token": token}` in an `httpx.post()` call to `https://oauth2.googleapis.com/revoke`. This encodes the token in the request URL, leaking it into server access logs, HTTP proxy logs, and browser history.
- **Prevention Rule:** Always send OAuth tokens in the **POST request body** (`data={"token": token}`) for revocation and any other sensitive token-passing calls. Never use `params=` for secrets. This applies to all providers (Google, Dropbox, Nextcloud, etc.) and is required by RFC 7009.

---

### [2026-10-07] Review of `22bfbed` — Client-Side Markdown Preview

#### Rule 5: Decide previewability only via `Document.is_download_only` and the live setting
- **Issue:** `MarkdownRenderer.is_dynamically_previewable` checked the persisted `doc.download_only` flag (written at upload), which cancelled the dynamic size-limit evaluation, so raising `MAX_PREVIEW_FILE_SIZE_MB` later did not re-enable large files.
- **Prevention Rule:** In renderers, decide previewability only through `Document.is_download_only` and the live dynamic setting. Never `or` it with the persisted `download_only` column. Add a regression test that raises the limit after upload.

#### Rule 6: Validate range on every client-supplied numeric analytics field
- **Issue:** The new `scroll_percentage` field was added to `PageViewRecordSerializer` without a range check, so clients could store values up to 32767 and surface them in analytics.
- **Prevention Rule:** Every client-supplied numeric analytics field needs explicit `min_value`/`max_value` on the serializer, plus a boundary test (e.g. 101 → 400).

#### Rule 7: Add i18n keys to all locale catalogs in the same change
- **Issue:** New UI strings and error messages used only in-code `t()` defaults, so the French locale shows English. One key (`viewSessions.readingDepth`) was used with two different defaults.
- **Prevention Rule:** When adding `t('key', default)` calls, add the key to every locale catalog in the same change and keep a single default per key.

---

### [2026-10-23] Storage Key Validation & Root Confinement

#### Rule 8: Enforce strict organization-scoped storage key validation across all finalize endpoints
- **Issue:** `FileRequestUploadFinalizeView`, `DocumentVersionUploadFinalizeView`, and dataroom `upload_finalize` accepted client-supplied `storage_key` values without validating organization prefix or checking for path traversal (`..`), allowing arbitrary file reads or cross-tenant document hijacking.
- **Prevention Rule:** All file upload finalize endpoints must enforce strict organization-scoped storage key validation (rejecting '..' and verifying organization prefix) via a shared validator. Never trust client-supplied storage keys without prefix and traversal checks.

#### Rule 9: File service handlers must always confine resolved paths to the storage root
- **Issue:** In the Go file service (`core/main.go`), `handleDownload` checked confinement only against the token's parent directory (`authorizedDir`) and failed to check against `storageRoot`, allowing a `storage_key` with `..` to escape the root directory and read arbitrary container files.
- **Prevention Rule:** Every file service handler that accesses disk (including `handleDownload` and subpath wildcard handlers) must strictly enforce safePrefix matching against `storageRoot`.

---

### [2026-10-24] Frontend i18n Anti-Pattern Review

#### Rule 10: Never use inline `defaultValue` in frontend `t('key')` calls
- **Issue:** Developers and AI assistants repeatedly pass inline `defaultValue` or fallback string arguments inside React `t('key', { defaultValue: '...' })`. All 6 locale catalogs (`en`, `zh-hans`, `de`, `fr`, `ru`, `nl`) are statically bundled and configured with `fallbackLng: 'en'`. Inline defaults introduce string duplication, violate DRY, cause text drift between JSX and JSON files, and bloat component code.
- **Prevention Rule:** All user-facing strings must be defined exclusively in the 6 locale catalogs (`frontend/src/locales/*/translation.json`). In React components and hooks, always call `t('key')` directly without `defaultValue` or inline fallback strings.

---

### [2026-10-31] Review of `c716294` — Dataroom Streaming Archive Download

#### Rule 11: Enforce ASCII fallback parameter in RFC 6266 `Content-Disposition` headers
- **Issue:** In Django's `get_valid_filename()`, Unicode characters (e.g. Chinese, Cyrillic) are preserved. Placing `get_valid_filename()` output directly into HTTP response headers (`filename="{ascii_name}"`) causes Gunicorn/WSGI to throw `UnicodeEncodeError` (Latin-1 constraint) and crash with HTTP 500.
- **Prevention Rule:** In RFC 6266 `Content-Disposition` headers, always force ASCII encoding (`.encode('ascii', 'ignore').decode('ascii')`) with a safe fallback on the `filename="..."` attribute, while encoding full Unicode names exclusively inside `filename*=UTF-8''{quote(name)}`.

#### Rule 12: Enforce download permissions at all depth levels during archive recursion
- **Issue:** In recursive dataroom archive generators, checking `allow_download` only at the root level allowed subfolders with `allow_download=False` to have their contents downloaded during whole-room archives.
- **Prevention Rule:** When building archive streaming traversals for hierarchical entities, enforce `is_visible` and `allow_download` checks at every recursion step for both folders and documents.



