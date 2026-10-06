# Signup with Email Verification and Default Organization Binding

## Goal
Implement a public signup flow where a user submits email/password, receives a verification email, and is activated only after clicking the verification link. The user is created as inactive first and is bound to the system default organization (`Organization.objects.first()`).

## Requirements
- Public signup endpoint can be enabled/disabled via admin setting.
- Signup request creates (or refreshes) an inactive account and sends verification email.
- Verification endpoint validates a Django auth token and activates the user.
- User is attached to the default org (same fallback pattern as existing `UserSerializer.create`).
- Existing login (`/api/v1/token/`) remains unchanged; inactive users cannot log in.

## Backend Design

### 1. Dynamic app setting (admin toggle)
- Add `ENABLE_PUBLIC_SIGNUP` to:
  - `backend/backend/settings.py` default value (`False`)
  - `backend/core/admin_views.py` `DEFAULT_SETTINGS` metadata
- Toggle is managed via existing `/api/v1/admin/settings/` endpoints.

### 2. Use Django auth activation tokens (remove pending token model)
- Remove `SignupVerificationToken` model usage for signup verification.
- Add a token generator for signup activation in `backend/core/tokens.py`:
  - Extend `PasswordResetTokenGenerator`
  - Include `user.is_active` in `_make_hash_value(...)` so token is invalid after activation (single-use behavior).
- Token payload uses:
  - `uidb64` (encoded user pk)
  - `token` (generated from the activation token generator)

### 3. API serializers
In `backend/core/serializers.py` add/update:
- `SignupRequestSerializer`: `email`, `password`, optional `name`; includes password validation.
- `SignupVerifySerializer`: `uid`, `token`.
- `SignupRequestAcceptedSerializer`: response shape for accepted request.
- `SignupVerifyResponseSerializer`: response shape after successful verification.

### 4. API views
In `backend/core/views.py` add/update:
- `SignupRequestView` (`POST /api/v1/signup/`):
  - checks `get_dynamic_setting('ENABLE_PUBLIC_SIGNUP')`
  - validates input
  - always returns generic accepted response (avoid enumeration)
  - if user does not exist:
    - resolve default org; if missing, return 500-like validation error
    - create user with `is_active=False`, `username=email`, bound org
  - if user exists and is inactive:
    - update password and name to latest submitted values (optional but recommended)
  - if user exists and is active:
    - do not modify account; still return generic accepted response
  - generate `uidb64` + activation token and send verification email
- `SignupVerifyView` (`POST /api/v1/signup/verify/`):
  - checks toggle enabled
  - validates `uid` and `token`
  - decodes user from `uid`, ensures user exists and is inactive
  - validates token with activation token generator
  - inside transaction with row lock:
    - re-check still inactive
    - set `is_active=True` and save
  - issue JWT token pair and return `{user, access, refresh}`

### 5. URL wiring
In `backend/backend/urls.py`:
- add `path('api/v1/signup/', SignupRequestView.as_view(), name='signup_request')`
- add `path('api/v1/signup/verify/', SignupVerifyView.as_view(), name='signup_verify')`

### 6. Email templates
Add templates under `backend/core/templates/core/`:
- `signup_verification_email.txt`
- `signup_verification_email.html`

Link format:
- `${SITE_DOMAIN}/signup/verify?uid=<uidb64>&token=<token>`

### 7. Tests
Add/extend `backend/tests/core/test_auth.py` with cases:
- signup disabled -> 403
- signup enabled (new email) -> 202 + inactive user created + `send_mail` called
- signup enabled (existing inactive user) -> 202 + password refreshed + `send_mail` called
- signup enabled (existing active user) -> 202 + account unchanged + optional email send policy asserted
- verify with valid uid/token -> user activated + JWT returned
- verify with invalid uid/token -> 400
- verify reused token (already activated) -> 400
- verify without default org during signup -> 500/400 with clear message

## Rollout sequence
1. Add activation token utility (`core/tokens.py`) and tests.
2. Update serializers + views + URLs to uid/token verification flow.
3. Remove `SignupVerificationToken` flow from views/model usage.
4. Update email templates and frontend query params (`uid`, `token`).
5. Tests and targeted test run.

## Notes
- This implementation is intentionally additive and does not remove current `RegisterView`.
- If desired, `RegisterView` can later be restricted/removed after frontend migration to the verification flow.
- If `SignupVerificationToken` is no longer used anywhere, follow up with migration to drop the table.
