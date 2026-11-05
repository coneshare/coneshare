# Code Review: Staged Frontend `AuthGuard` & `LoginPage` Redirect Changes

**Date:** 2026-10-28  
**Scope:** Staged frontend files:
- `frontend/src/App.jsx`
- `frontend/src/components/auth/AuthGuard.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/tests/components/auth/AuthGuard.test.jsx`
- `frontend/src/tests/pages/LoginPage.test.jsx`
- `frontend/vitest.whitelist.json`

---

## Findings Summary

| # | Severity | Component / File | Description |
| :- | :---: | :--- | :--- |
| **1** | **MEDIUM** | `frontend/src/components/auth/AuthGuard.jsx:4`, `frontend/src/contexts/UserProvider.jsx:24, 42` | **`UserProvider` Only Checks `access_token` While `AuthGuard` Permits `refresh_token`-Only Entry**: `AuthGuard` allows `<MainLayout />` to mount when only `refresh_token` is in `localStorage`, but `UserProvider.jsx` only reads `localStorage.getItem("access_token")`. When `access_token` is absent on mount, `UserProvider` skips `getUser()`, leaving `user` as `null` in `UserContext` even after downstream API calls refresh the access token. |
| **2** | **LOW** | `frontend/src/pages/LoginPage.jsx:51-57` | **Unvalidated `location.state?.from` Target in `LoginPage.jsx`**: `from` is passed directly to `navigate(from, { replace: true })` without verifying that it is an internal path (`startsWith('/') && !startsWith('//')`) and not `/login` itself. |
| **3** | **LOW** | `frontend/src/App.jsx:73-75`, `frontend/src/pages/CloudAuthCallbackPage.jsx:48` | **`/auth/:providerName/callback` (`CloudAuthCallbackPage`) Left Outside `<AuthGuard />`**: `CloudAuthCallbackPage` calls authenticated endpoints (`completeDropboxConnect`, `completeGoogleDriveConnect`, `completeNextcloudConnect`). Being outside `AuthGuard`, an unauthenticated visit triggers a hard `window.location.href = '/login'` in `api.js` and loses the `?code=...&state=...` query parameters. |
| **4** | **VERIFIED** | `frontend/vitest.whitelist.json`, `AuthGuard.test.jsx`, `LoginPage.test.jsx` | **Whitelist Registration & Test Coverage**: `AuthGuard.test.jsx` is registered in `frontend/vitest.whitelist.json` and all 10 unit tests in `AuthGuard.test.jsx` and `LoginPage.test.jsx` pass. |

---

## Detailed Evaluation & Remediation

### 1. [MEDIUM] `UserProvider` Only Checks `access_token` While `AuthGuard` Permits `refresh_token`-Only Entry

#### Affected Locations
- `frontend/src/components/auth/AuthGuard.jsx:4`
- `frontend/src/contexts/UserProvider.jsx:24, 42`

#### Problem Mechanics
In `AuthGuard.jsx:4`:
```javascript
export function AuthGuard() {
  const token = localStorage.getItem('access_token') || localStorage.getItem('refresh_token');
```
However, when `AuthGuard` renders `<Outlet />` (`<MainLayout />`), `UserProvider.jsx:41-49` executes:
```javascript
    const fetchUser = async () => {
      const token = localStorage.getItem("access_token");
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const response = await getUser(decoded.user_id);
```
If `access_token` is missing (`null`) and only `refresh_token` is present in `localStorage` (the exact scenario tested in `AuthGuard.test.jsx:57-64`), `UserProvider` skips `getUser()`. Even when a child page (such as `HomePage` or `DocumentsPage`) subsequently triggers the Axios 401 token refresh interceptor and writes a fresh `access_token` to `localStorage`, `UserProvider`'s mount effect does not re-run, leaving `user` in `UserContext` as `null` (blank user profile and quota in the sidebar).

#### Required Remediation
In `frontend/src/contexts/UserProvider.jsx` (both `refreshUser` at line 24 and `fetchUser` at line 42), fall back to `refresh_token`:
```javascript
const token = localStorage.getItem("access_token") || localStorage.getItem("refresh_token");
```
SimpleJWT encodes `user_id` in both `access` and `refresh` tokens, and calling `getUser(decoded.user_id)` will transparently refresh the access token via the Axios interceptor in `api.js`.

---

### 2. [LOW] Unvalidated `location.state?.from` Target in `LoginPage.jsx`

#### Affected Location
- `frontend/src/pages/LoginPage.jsx:51-57`

#### Problem Mechanics
```javascript
      const fromLocation = location.state?.from
      const from = typeof fromLocation === 'string'
        ? fromLocation
        : fromLocation?.pathname
          ? `${fromLocation.pathname}${fromLocation.search || ''}${fromLocation.hash || ''}`
          : '/'
      navigate(from, { replace: true })
```
If `location.state?.from` is set to `/login` or a non-single-slash path (e.g. `//example.com`), `navigate(from, { replace: true })` will either keep the user on `/login` after signing in or navigate to an unintended target.

#### Required Remediation
```javascript
      const fromLocation = location.state?.from
      const rawFrom = typeof fromLocation === 'string'
        ? fromLocation
        : fromLocation?.pathname
          ? `${fromLocation.pathname}${fromLocation.search || ''}${fromLocation.hash || ''}`
          : '/'
      const from =
        rawFrom.startsWith('/') && !rawFrom.startsWith('//') && !rawFrom.startsWith('/login')
          ? rawFrom
          : '/'
      navigate(from, { replace: true })
```

---

### 3. [LOW] `/auth/:providerName/callback` (`CloudAuthCallbackPage`) Left Outside `<AuthGuard />`

#### Affected Locations
- `frontend/src/App.jsx:73-75`
- `frontend/src/pages/CloudAuthCallbackPage.jsx:48`

#### Problem Mechanics
`CloudAuthCallbackPage` calls authenticated backend endpoints (`completeDropboxConnect`, `completeGoogleDriveConnect`, `completeNextcloudConnect`). Because `<Route path="/auth/:providerName/callback" element={<CloudAuthCallbackPage />} />` is outside `<Route element={<AuthGuard />}>`, an unauthenticated request triggers a `401` and `window.location.href = '/login'` in `api.js`, losing the `?code=...&state=...` OAuth callback parameters instead of preserving `location` in `state={{ from: location }}`.

#### Required Remediation
Move `<Route path="/auth/:providerName/callback" element={<CloudAuthCallbackPage />} />` inside `<Route element={<AuthGuard />}>` (as a sibling to `<Route element={<MainLayout />}>` so it remains full-screen without the sidebar).

---

## Proposed Additions to Long-Term Memory

```markdown
# Proposed Additions to Long-Term Memory
[ ] Issue: `AuthGuard` allowed route entry when only `refresh_token` existed in `localStorage`, but `UserProvider` only checked `localStorage.getItem("access_token")` on mount, leaving `UserContext.user` as `null` even after downstream API calls refreshed the access token.
Prevention Rule: Keep token-presence checks consistent between `AuthGuard` and `UserProvider` (`localStorage.getItem('access_token') || localStorage.getItem('refresh_token')`), and always validate `location.state?.from` in `LoginPage` to ensure it is a relative internal path (`startsWith('/') && !startsWith('//')`) and not `/login`.
```
