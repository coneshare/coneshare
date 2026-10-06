# Dynamic Settings Typed Values Plan

## Goal
Ensure dynamic settings are handled as typed values instead of raw strings, so boolean flags like `ENABLE_PUBLIC_SIGNUP` behave correctly across the app.

## Plan

1. Add typed parsing to dynamic settings at the source.
- Implement a single coercion function in backend (same layer as `get_dynamic_setting`) that converts stored string values to expected Python types.
- For booleans, treat these as `True`: `true`, `1`, `yes`, `on` (case-insensitive).
- Treat these as `False`: `false`, `0`, `no`, `off`, empty string.
- If value is invalid, log warning and fall back to default.

2. Define type metadata per setting.
- Extend `DEFAULT_SETTINGS` metadata to include a `type` field (`bool`, `int`, `str`, etc.).
- Keep defaults in native types, not string literals.

3. Update `get_dynamic_setting` behavior.
- Return typed values based on metadata/default type, instead of raw DB strings.
- Preserve backward compatibility for existing callers by ensuring known settings still resolve correctly.

4. Validate writes in admin settings update endpoint.
- On `PATCH /api/v1/admin/settings/{key}/`, validate/coerce input according to setting type before saving.
- Store a normalized representation (e.g., `true`/`false` for bool) to avoid drift.

5. Fix public settings endpoint usage.
- Remove `bool(...)` wrapping there and rely on typed `get_dynamic_setting('ENABLE_PUBLIC_SIGNUP')`.

6. Add tests.
- Unit tests for coercion function (truthy/falsy/invalid values).
- Integration tests for:
  - admin setting write/read roundtrip for bools,
  - `ENABLE_PUBLIC_SIGNUP=false` results in `enable_public_signup: false`,
  - signup endpoints respect disabled/enabled toggle correctly.

7. Optional cleanup migration (later).
- Normalize existing `AppConfiguration.value` entries for known boolean keys to canonical `true`/`false` strings.
