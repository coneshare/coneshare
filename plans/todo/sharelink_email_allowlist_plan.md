# 🔒 Feature Plan: ShareLink Email & Domain Wildcard Allowlist

- **Status:** Proposed / Pending Implementation
- **Target Milestone:** `CE 1.12.0`
- **Related Issue:** [coneshare/coneshare#368](https://github.com/coneshare/coneshare/issues/368)
- **Target Components:** `backend/sharelinks/`, `frontend/src/components/links/`, `frontend/src/components/viewer/`, `frontend/src/pages/ShareLinkViewerPage.jsx`, `frontend/src/utils/errorTranslator.js`, `frontend/src/locales/`
- **Reference Case:** Longstraw Carbon fork (`audience_mode` / `audience_emails` / `backend/sharelinks/audience.py`), refined for mainline security and UX requirements.

---

## 1. Executive Summary & Scope

Currently, `ShareLink` only supports `requires_email` (observability / self-reported email) and `requires_email_verification` (magic-link ownership check), which verify email format or ownership without restricting *which* recipients or organizations may access a shared document or Dataroom.

This plan implements **Email & Domain Wildcard Allowlists** on `ShareLink` to close [Issue #368](https://github.com/coneshare/coneshare/issues/368) (including the community request for domain-level allowlists such as `@lpfirm.com` / `*@lpfirm.com`).

### Scope (CE 1.12.0 MVP)
- **Included:**
  - `audience_mode` (`anyone` / `allowlist`) and `audience_emails` (`JSONField`) on `ShareLink`
  - Normalized exact-email + domain/subdomain wildcard matching with strict pattern validation
  - Serializer validation and automatic `requires_email` linkage
  - Multi-stage enforcement across `/request-access/`, `/verify-access-token/confirm/`, `/view-data/` (`accessToken` pre-check), `_verify_share_link_session_authorization`, `_check_sequential_gate_prerequisites` (password/NDA gates), and `_get_authorized_qna_view_session` (public Q&A)
  - `LinkSheet.jsx` UI, `EmailForm.jsx` / `ShareLinkViewerPage.jsx` `403` recovery flow, `errorTranslator.js` mappings, and 6-locale i18n updates
  - Comprehensive backend (`pytest`) and frontend (`vitest`) test coverage
- **Deferred (Out of MVP / Phase 2):**
  - Self-service "Request Access" workflow allowing rejected visitors to submit an approval request to the link owner.
  - Exposing `audience_mode` / `audience_emails` in `ShareLinkTemplate`, MCP tools (`mcp-server/coneshare_mcp/tools/share_links.py`), `LinkSettingsSummary.jsx`, and Admin Links views/serializers (`admin_serializers.py`, `AdminLinksPage.jsx`, `AdminLinkInspectDrawer.jsx`).

---

## 2. Data Model & Migration (`backend/sharelinks/models.py`)

Add audience restriction fields to `ShareLink`:

```python
AUDIENCE_ANYONE = 'anyone'
AUDIENCE_ALLOWLIST = 'allowlist'
AUDIENCE_CHOICES = [
    (AUDIENCE_ANYONE, 'Anyone with the link'),
    (AUDIENCE_ALLOWLIST, 'Specific emails or domains'),
]

audience_mode = models.CharField(
    max_length=20,
    choices=AUDIENCE_CHOICES,
    default=AUDIENCE_ANYONE,
)
audience_emails = models.JSONField(default=list, blank=True)
```

- **Backward Compatibility:** Existing `ShareLink` records default to `audience_mode='anyone'` and `audience_emails=[]`.
- **Database Migration Required:** Adding `audience_mode` and `audience_emails` requires a Django migration in `backend/sharelinks/migrations/`. Per workspace policy, do **not** run `makemigrations` or `migrate` autonomously; call out the required migration clearly for the maintainer to run manually.

*(Note: `ShareLinkTemplate` is kept unchanged for the MVP and can be extended later if organization-wide default allowlists are needed.)*

---

## 3. Pattern Validation & Matching (`backend/sharelinks/audience.py`)

Create a dedicated helper module `backend/sharelinks/audience.py` with strict validation and case-insensitive matching:

1. **Allowed Character Set & Glob Safety:**
   - Restrict entries to `^[a-z0-9.+_%*-]+@[a-z0-9.*-]+$` after `.strip().lower()`.
   - Explicitly exclude `?` and `[]` so `fnmatchcase` only interprets `*` as a wildcard.
2. **Shorthand Domain Normalization:**
   - Support `@domain.com` shorthand (as requested in Issue #368) by normalizing entries starting with `@` (e.g. `@lpfirm.com`) to `*@lpfirm.com`.
3. **Strict Domain & Wildcard Validation:**
   - Require exactly one `@` with non-empty local and domain parts (reject `@`, `*@`, `@*`).
   - Split the domain on `.` into labels and require:
     - At least 2 labels (must contain `.`),
     - No empty labels (reject leading, trailing, or consecutive dots such as `@.example.com`, `@example.com.`, `@..com`),
     - No wildcard `*` anywhere in the final TLD label (`'*' not in labels[-1]`) and `len(labels[-1]) >= 2` (rejecting `*@*`, `alice@*`, `*@com`, `*@*.*`, `*@example.*`, `*@*.c*`).
   - For entries without `*`, validate using Django's `validate_email`.
4. **Deduplication & Limits:**
   - `normalize_entries(values)` trims, normalizes, deduplicates while preserving order, and enforces `MAX_ENTRIES = 500`.
5. **Matching:**
   - `email_matches(email, patterns)` normalizes the candidate email and evaluates `fnmatchcase(email, pattern)` against stored patterns.

---

## 4. Serializer Validation & Gate Linkage (`backend/sharelinks/serializers.py`)

Update `ShareLinkSerializer`:

1. Expose `'audience_mode'` and `'audience_emails'` on `ShareLinkSerializer.Meta.fields`.
2. **Keep Allowlist Private (`backend/sharelinks/views.py`):** Never expose `audience_emails` (or raw allowlist rules) in `_build_share_link_public_meta`, `link_settings`, or any unauthenticated public endpoint. Include `link.audience_mode == ShareLink.AUDIENCE_ALLOWLIST` in `is_restricted` (in both `_build_share_link_public_meta` and `link_settings`) as defense-in-depth.
3. **`_validate_audience(self, data)`:**
   - Resolve effective `mode` (falling back to `self.instance.audience_mode` on `PATCH`).
   - When `mode == ShareLink.AUDIENCE_ALLOWLIST`:
     - Normalize `audience_emails` (falling back to `self.instance.audience_emails` on partial `PATCH` when omitted).
     - Raise `ValidationError` if the resulting list is empty.
     - Unconditionally force `data['requires_email'] = True` (matching how `ShareLinkSerializer.validate` forces `data['allow_download'] = True` for `document.is_download_only`, including on partial `PATCH` requests that pass `requires_email=False`).
     - **Email Verification Policy:** Do not hard-block `requires_email_verification=False` at the API layer (to keep compatibility for lightweight self-hosted deployments without SMTP), while defaulting it to `True` in the frontend UI when `allowlist` is selected.
   - When `mode == ShareLink.AUDIENCE_ANYONE`:
     - Clear `data['audience_emails'] = []`.

---

## 5. Multi-Stage Access Control (`backend/sharelinks/views.py`)

Add a helper `_is_email_in_link_audience(link: ShareLink, email: str) -> bool` that fails closed for unknown `audience_mode` values (and a session helper checking `email_method not in ('owner', 'account')`), and enforce it at all checkpoints:

1. **Access Request (`ShareLinkRequestAccessView.post`):**
   - Check `_is_email_in_link_audience(link, email)` **before** creating a `Viewer` record, dispatching automation events, or generating/sending an `EmailVerificationToken`.
   - On mismatch, return a generic `403 Forbidden` response (e.g. `{"message": "This email address is not authorized to access this link."}`) without revealing whether a specific address or domain is listed.
2. **Magic-Link Token Pre-check & Confirmation (`ShareLinkViewDataView` `access_token` branch & `ShareLinkConfirmAccessView.post`):**
   - Re-check `_is_email_in_link_audience(link, verification.email)` before storing `pending_email_verifications` and before consuming the token.
   - This prevents stale tokens (issued before the allowlist was narrowed) from granting access; on mismatch, delete the token (and any pending verification entry) and return `403 Forbidden` with `{"message": "This email address is not authorized to access this link.", "protectionType": "email"}`.
3. **Active Session Re-validation (`_verify_share_link_session_authorization`):**
   - When `link.audience_mode == ShareLink.AUDIENCE_ALLOWLIST` and `auth_status_dict.get('email_method') not in ('owner', 'account')`:
     - Verify `_is_email_in_link_audience(link, auth_status_dict.get('viewer_email', ''))`.
     - If an existing external session no longer matches the updated allowlist, clear its email authorization state (`email_verified`, `viewer_email`, `email_method`) in `request.session['authorized_share_links'][str(link.id)]` and return `401 Unauthorized` with `{"message": "This link requires an email address to view.", "protectionType": "email"}` across `view-data`, `page`, `render-page`, `download-file`, `download-folder`, `download-dataroom`, `view-sessions`, and `page-views`.
     - Returning `401` with `protectionType: "email"` ensures `ShareLinkViewerPage` returns the visitor cleanly to `<EmailForm>` and `api.js` skips the JWT refresh interceptor (`isPublicProtectionError`).
4. **Sequential Gate Prerequisites & Public Q&A (`_check_sequential_gate_prerequisites` & `_get_authorized_qna_view_session`):**
   - Neither helper calls `_verify_share_link_session_authorization`, so both must also check `_is_email_in_link_audience` when `link.audience_mode == ShareLink.AUDIENCE_ALLOWLIST` and `email_method not in ('owner', 'account')`.
   - This prevents a removed visitor from continuing through `ShareLinkVerifyPasswordView` / `ShareLinkAcceptNDAView` or reading/posting Q&A threads with an existing `view_session_id`.
5. **Owner / Collaborator Bypass Preservation:**
   - Sessions authorized via `can_user_manage_share_link(request.user, link)` (`email_method` `'owner'` / `'account'`) and `is_preview=True` continue bypassing the allowlist gate.

---

## 6. Frontend UI & Internationalization (`frontend/src/`)

1. **`frontend/src/components/links/LinkSheet.jsx`:**
   - Add an audience selector (`audienceMode`: `'anyone'` | `'allowlist'`).
   - When `'allowlist'` is selected:
     - Automatically enable and lock `requiresEmail = true`.
     - Automatically enable `requiresEmailVerification = true` when switching from `'anyone'` to `'allowlist'` (if disabled manually by the user, show a helper warning noting that unverified emails are self-reported).
     - Render a multiline textarea (`audienceEmailsText`) accepting newline- or comma-separated entries (`alice@company.com`, `*@company.com`, `@company.com`), parsing them into `audience_emails` on submit and re-hydrating on edit.
2. **`frontend/src/utils/errorTranslator.js`:**
   - Add the new backend `403` unauthorized-email message to `ERROR_STRING_MAPPINGS` so the global Axios interceptor (`api.js`) and viewer error displays localize it across all 6 languages.
3. **`frontend/src/pages/ShareLinkViewerPage.jsx` & `frontend/src/components/viewer/EmailForm.jsx`:**
   - In `ShareLinkViewerPage.jsx`, handle `err.response?.status === 403 && errorData?.protectionType === 'email'` (from a stale `accessToken` on `GET /view-data/`) by rendering `<EmailForm>` instead of the generic dead-end error card so the visitor can enter another email.
   - In `EmailForm.jsx`, on `confirmShareLinkEmailAccess` `403` (stale magic link), exit the `requiresConfirmation` state (e.g. via a local reset or callback clearing `accessToken` confirmation) so the visitor is returned to the email input form instead of being stuck on the "Continue" screen. Keep error feedback clean without duplicating the global Axios toast.
4. **Localization (`frontend/src/locales/{de,en,fr,nl,ru,zh-hans}/translation.json`):**
   - Add all new `linkSheet.*`, `viewer.*`, and `errors.*` keys to all 6 locale catalogs.
   - Follow Rule 10 (no inline `defaultValue` fallback strings in any new `t('key')` calls).

---

## 7. Verification & Test Plan

### Backend (`pytest`)
- **`backend/tests/sharelinks/test_audience.py` (New):**
  - `clean_entry` / `normalize_entries` / `email_matches`: case folding, deduplication, `@domain.com` -> `*@domain.com` normalization, rejection of `*@*`, `a@*`, `*@com`, `*@*.*`, `*@example.*`, `*@*.c*`, `@..com`, `@.example.com`, `?`, `[]`, invalid emails, and `MAX_ENTRIES` (>500).
- **`backend/tests/sharelinks/test_views.py` (Extend):**
  - `ShareLinkViewSet`: create/update `allowlist`, force `requires_email=True` (including on `PATCH` with `requires_email=False`), partial `PATCH` preservation, clear `audience_emails` on switch back to `anyone`, and verify `audience_emails` is never leaked in `public-meta` or `view-data` `link_settings`.
  - `ShareLinkRequestAccessView`: exact and wildcard allow/deny (`403`), ensuring rejected requests do not create `Viewer` or `EmailVerificationToken` rows.
  - `ShareLinkConfirmAccessView` & `ShareLinkViewDataView`: token issued before allowlist narrowing is rejected (`403` with `protectionType: "email"`) and deleted; active external visitor session is invalidated (`401` with `protectionType: "email"`) if removed from allowlist; owner/collaborator preview remains unaffected.
  - `ShareLinkVerifyPasswordView`, `ShareLinkAcceptNDAView`, and public Q&A endpoints: removed external visitor session is blocked by `_check_sequential_gate_prerequisites` and `_get_authorized_qna_view_session`.

### Frontend (`vitest`)
- **`frontend/src/tests/components/links/LinkSheet.test.jsx` (Extend):**
  - Switching to `allowlist` locks `requiresEmail`, defaults `requiresEmailVerification`, parses newline/comma entries, and hydrates existing `audience_emails` on edit.
- **`frontend/src/tests/pages/ShareLinkViewerPage.test.jsx` (Extend):**
  - Renders `<EmailForm>` (rather than generic error screen) when `GET /view-data/?accessToken=...` returns `403` with `protectionType: "email"`, and allows switching back to email input when `/verify-access-token/confirm/` returns `403`.
  - Verifies localized error mapping via `errorTranslator.js`.
- Register any newly added test file paths in `frontend/vitest.whitelist.json` and run `i18n.test.jsx` to verify all 6 locale catalogs stay in sync.
