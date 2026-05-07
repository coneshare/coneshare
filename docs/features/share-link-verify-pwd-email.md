# Share Link Password + Email Verification Logic

This document captures how public share-link access control works for:
- password protection
- email-required access
- optional email verification via magic link

It is intended as a quick implementation reference for future development.

## Scope

Applies to public viewer flows for:
- document share links
- dataroom share links

Core backend implementation is in:
- `backend/sharelinks/views.py`
- `backend/sharelinks/urls.py`

Core frontend implementation is in:
- `frontend/src/pages/ShareLinkViewerPage.jsx`
- `frontend/src/components/viewer/PasswordForm.jsx`
- `frontend/src/components/viewer/EmailForm.jsx`
- `frontend/src/services/api.js`
- `frontend/src/components/links/LinkSheet.jsx`

## Settings and Toggles

Share link settings include:
- `requires_email`
- `requires_email_verification`
- `password` (if set, link is password-protected)

Frontend save behavior:
- `requires_email_verification` is only sent as true when `requires_email` is true.
- In `LinkSheet`, payload uses:
  - `requires_email: requiresEmail`
  - `requires_email_verification: requiresEmail && requiresEmailVerification`

## Public Endpoints

- `GET /api/v1/links/{slug}/view-data/`
  - gatekeeper endpoint; enforces protections
- `POST /api/v1/links/{slug}/verify-password/`
  - verifies password; sets session authorization
- `POST /api/v1/links/{slug}/request-access/`
  - handles email step (immediate or magic-link)

Related:
- `GET /view/{slug}?accessToken=...` (frontend route)
  - frontend shell reads query and calls `view-data`

## Server-Side Access Sequence

The `view-data` endpoint is the source of truth for protection checks.

Protection order (public mode):
1. link exists and active
2. link not expired
3. password check
4. email check

If password not satisfied:
- response: `401`
- payload includes `protectionType: "password"`

If email not satisfied:
- response: `401`
- payload includes `protectionType: "email"`

## Session Authorization Model

Authorization state is stored in Django session under:
- `authorized_share_links[{link_id}]`

Keys used:
- `password_verified`
- `email_verified`
- `viewer_email`

This means access is session-based (browser/session context), not tokenless stateless checks.

## Password Flow

1. Viewer hits `view-data`.
2. If password required and not verified, backend returns `401` + `protectionType: "password"`.
3. Frontend renders `PasswordForm`.
4. `PasswordForm` posts to `/verify-password/`.
5. On success:
   - backend sets `password_verified = true` in session for that link
   - frontend refetches `view-data`
6. If wrong password:
   - backend returns `401` + `protectionType: "password"`
   - frontend shows invalid-password message (no auth redirect)

## Email Flow (`requires_email = true`)

1. After passing password stage (if any), `view-data` checks email authorization.
2. If missing, returns `401` + `protectionType: "email"`.
3. Frontend renders `EmailForm`.
4. `EmailForm` posts entered email to `/request-access/`.

Then behavior diverges by `requires_email_verification`:

### A) Verification OFF

- backend sets:
  - `email_verified = true`
  - `viewer_email = submitted email`
- returns:
  - `{"message": "Access granted.", "verification_required": false}`
- frontend refetches `view-data` and continues.

### B) Verification ON

- backend creates `EmailVerificationToken` (single-use style via delete-then-create for same link/email)
- backend sends magic-link email to viewer:
  - `/view/{slug}?accessToken={token}`
- returns:
  - `{"message": "...", "verification_required": true}`
- frontend shows “check your email” state.

When viewer opens magic link:
- frontend reads `accessToken` query param and calls `view-data`
- backend validates token and link binding, checks expiry, authorizes session:
  - `password_verified = true`
  - `email_verified = true`
  - `viewer_email = token email`
- backend deletes token after use

## Toggle Effect Summary

If **Verify email to view** is:
- OFF: email entry only, immediate access after submit
- ON: email entry + mandatory magic-link click before access

## Frontend Interceptor Note (401 Handling)

Global axios interceptor in `frontend/src/services/api.js` distinguishes:
- public protection 401s (`protectionType` is `password`/`email`)
- authenticated API 401s (token refresh/logout behavior)

Public protection 401s must not trigger auth refresh/login redirect.

## UX Notes

Protected dialogs (password/email) show:
- owner info card when public metadata is available
- fallback heading (`Password Required` / `Email Required`) when metadata is unavailable

Current copy behavior:
- document link: `user(masked-email) shared "xxx"`
- dataroom link: `user(masked-email) invited you to the dataroom "xxx"`

## Important Caveat

Changing link protection settings does not automatically revoke already-authorized existing browser sessions. Because authorization is stored in server session state, previously authorized sessions can remain valid until session state is cleared/expired.

