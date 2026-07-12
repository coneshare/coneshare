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
