# Code Review: Staged Fixes for Video Preview Token TTL & HLS Token Refresh

**Date:** 2026-10-29  
**Scope:** Staged files across `core/`, `backend/`, and `frontend/`:
- `backend/documents/fileserver.py`
- `backend/documents/views.py`
- `backend/sharelinks/views.py`
- `core/main.go`
- `core/main_test.go`
- `frontend/src/components/documents/DocumentPreviewModal.jsx`
- `frontend/src/components/documents/VideoViewer.jsx`
- `frontend/src/components/viewer/DataroomViewer.jsx`
- `frontend/src/pages/ShareLinkViewerPage.jsx`
- `frontend/src/tests/components/documents/DocumentPreviewModal.test.jsx`
- `frontend/src/tests/components/documents/VideoViewer.test.jsx`

---

## Findings Summary

| # | Severity | Component / File | Description |
| :- | :---: | :--- | :--- |
| **1** | **HIGH** | `frontend/src/components/documents/VideoViewer.jsx:99-159`, `DataroomViewer.jsx:1232`, `ShareLinkViewerPage.jsx:767` | **Unstable `onTokenExpired` Effect Dependency Destroys HLS Player on Parent Re-renders**: `onTokenExpired` is included in the `[videoUrl, onTokenExpired]` dependency array of the HLS setup `useEffect`, while both `DataroomViewer.jsx` and `ShareLinkViewerPage.jsx` pass inline arrow functions. Every parent re-render creates a new function reference, triggering cleanup (`hlsRef.current.destroy()`) and tearing down/recreating the `Hls` instance mid-playback. |
| **2** | **MEDIUM** | `frontend/src/components/viewer/DataroomViewer.jsx:647-654, 1125-1132` | **`DataroomViewer.fetchDocumentViewData` Unmounts `<VideoViewer />` During Token Refresh, Wiping `savedPositionRef`**: `fetchDocumentViewData(selectedDocumentId, { force: true })` unconditionally calls `setIsDocumentLoading(true)`, replacing `<VideoViewer />` with a loading spinner and resetting `savedPositionRef.current` to `0` so playback restarts from `0:00`. |
| **3** | **MEDIUM** | `frontend/src/components/documents/VideoViewer.jsx:97-115` | **`savedPositionRef` Leaks Across Different Videos When `<VideoViewer />` Stays Mounted**: `savedPositionRef` restores `video.currentTime` on `loadedmetadata` whenever `videoUrl` changes, without distinguishing a token refresh for the same video from switching to a different video or document version. |
| **4** | **LOW** | `backend/documents/views.py:758-762`, `backend/sharelinks/views.py:1103-1107`, `DocumentPreviewModal.test.jsx:176-203` | **Missing Backend Unit Tests for `stream_ttl` / `expiry_seconds` & Incomplete Modal Token-Refresh Assertion**: No backend tests assert `expiry_seconds=max(14400, video_duration + 3600)` on `fileserver_client.generate_preview_url`, and `DocumentPreviewModal.test.jsx` does not simulate a 403 `Hls.Events.ERROR` to verify `handleTokenExpired` refetches preview data. |

---

## Detailed Evaluation & Remediation

### 1. [HIGH] Unstable `onTokenExpired` Effect Dependency in `VideoViewer.jsx`

In `frontend/src/components/documents/VideoViewer.jsx:99-159`:
```jsx
useEffect(() => {
  const video = videoRef.current;
  if (!video || !videoUrl) return;
  ...
  return () => {
    video.removeEventListener('timeupdate', handleTimeUpdate);
    video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    } else if (video) {
      video.removeAttribute('src');
      video.load();
    }
  };
}, [videoUrl, onTokenExpired]);
```

And in `DataroomViewer.jsx:1232` & `ShareLinkViewerPage.jsx:767`:
```jsx
onTokenExpired={() => fetchDocumentViewData(selectedDocumentId, { force: true })}
// and
onTokenExpired={() => setRefetchTrigger((c) => c + 1)}
```

#### Problem Mechanics
- Both `DataroomViewer` and `ShareLinkViewerPage` pass inline arrow functions as `onTokenExpired`.
- Whenever the parent component re-renders for any reason (e.g., `viewId` or `currentDataroomVisitId` resolving asynchronously after mount, opening/closing the sidebar or Q&A panel, or root items finishing load), `onTokenExpired` receives a new function identity.
- Because `onTokenExpired` is in the `useEffect` dependency array `[videoUrl, onTokenExpired]`, React runs the cleanup function (`hlsRef.current.destroy()`) and re-initializes a brand-new `Hls` instance on every parent state update.

#### Required Remediation
Store `onTokenExpired` in a ref inside `VideoViewer.jsx` and depend only on `[videoUrl]` in the HLS initialization effect:
```jsx
const onTokenExpiredRef = useRef(onTokenExpired);
useEffect(() => {
  onTokenExpiredRef.current = onTokenExpired;
}, [onTokenExpired]);
```
Then inside the `Hls.Events.ERROR` handler:
```jsx
if ((data.response?.code === 401 || data.response?.code === 403) && typeof onTokenExpiredRef.current === 'function') {
  isRefreshingTokenRef.current = true;
  onTokenExpiredRef.current();
  break;
}
```
And keep the `useEffect` dependency array strictly `[videoUrl]`.

---

### 2. [MEDIUM] `DataroomViewer.fetchDocumentViewData` Unmounts `<VideoViewer />` on Token Refresh

In `frontend/src/components/viewer/DataroomViewer.jsx:647-654`:
```jsx
const fetchDocumentViewData = useCallback(async (docId, { force = false } = {}) => {
  if (activeDocIdRef.current === docId && !force) {
    return;
  }
  activeDocIdRef.current = docId;

  const requestId = ++docRequestRef.current;
  setIsDocumentLoading(true);
```

#### Problem Mechanics
- Line 1125 renders `{isDocumentLoading ? <LoadingSpinner /> : documentViewData ? <VideoViewer ... /> : null}`.
- When `onTokenExpired` invokes `fetchDocumentViewData(selectedDocumentId, { force: true })`, setting `isDocumentLoading = true` unmounts `<VideoViewer />`.
- Unmounting destroys the component instance and resets `savedPositionRef.current` back to `0`, so when the new token arrives, playback restarts from `0:00`.

#### Required Remediation
Support a silent/in-place refresh option in `fetchDocumentViewData`:
```jsx
const fetchDocumentViewData = useCallback(async (docId, { force = false, silent = false } = {}) => {
  if (activeDocIdRef.current === docId && !force) {
    return;
  }
  activeDocIdRef.current = docId;

  const requestId = ++docRequestRef.current;
  if (!silent) {
    setIsDocumentLoading(true);
  }
```
And pass `onTokenExpired={() => fetchDocumentViewData(selectedDocumentId, { force: true, silent: true })}`.

---

### 3. [MEDIUM] `savedPositionRef` Leaks Across Different Videos When `<VideoViewer />` Stays Mounted

In `frontend/src/components/documents/VideoViewer.jsx:97-115`:
```jsx
const savedPositionRef = useRef(0);

useEffect(() => {
  const video = videoRef.current;
  if (!video || !videoUrl) return;

  const handleTimeUpdate = () => {
    if (video.currentTime > 0) {
      savedPositionRef.current = video.currentTime;
    }
  };
  video.addEventListener('timeupdate', handleTimeUpdate);

  const handleLoadedMetadata = () => {
    if (savedPositionRef.current > 0 && Math.abs(video.currentTime - savedPositionRef.current) > 0.5) {
      video.currentTime = savedPositionRef.current;
    }
  };
  video.addEventListener('loadedmetadata', handleLoadedMetadata);
```

#### Problem Mechanics
- `savedPositionRef` is never reset when `videoUrl` changes due to switching to a different video or document version while `<VideoViewer />` remains mounted.
- Watching Video A to `02:00` and switching to Video B seeks Video B to `02:00` upon `loadedmetadata`.

#### Required Remediation
Gate position restoration with an `isRefreshingTokenRef` flag that is set only when `onTokenExpired` triggers the reload:
```jsx
const savedPositionRef = useRef(0);
const isRefreshingTokenRef = useRef(false);

useEffect(() => {
  const video = videoRef.current;
  if (!video || !videoUrl) return;

  if (!isRefreshingTokenRef.current) {
    savedPositionRef.current = 0;
  }
  isRefreshingTokenRef.current = false;
```

---

### 4. [LOW] Missing Backend Unit Tests for `stream_ttl` / `expiry_seconds` & Incomplete Modal Token-Refresh Assertion

1. **Backend Tests (`backend/tests/documents/test_views.py` & `backend/tests/sharelinks/test_views.py`):**
   - Add unit tests verifying that `DocumentPreviewDataView` and `ShareLinkViewDataView` pass `expiry_seconds=max(14400, video_duration + 3600)` to `fileserver_client.generate_preview_url` when `preview_mode == 'video'` and `render_status == 'ready'`.
2. **Frontend Test (`frontend/src/tests/components/documents/DocumentPreviewModal.test.jsx:176-203`):**
   - Extend the test to trigger a fatal 403 `Hls.Events.ERROR` callback and assert that `getDocumentPreviewData` is called a second time to refresh `video_preview_url`.

---

## Proposed Additions to Long-Term Memory

```markdown
# Proposed Additions to Long-Term Memory
[ ] Issue: Adding callback props (such as `onTokenExpired`) directly to media-player initialization `useEffect` dependency arrays in `VideoViewer.jsx` caused `Hls` instances to be destroyed and recreated on every parent re-render when callers passed inline arrow functions.
Prevention Rule: Never include callback props in `useEffect` dependency arrays that manage heavy imperative lifecycle instances (such as `Hls.js`, `PDF.js`, or WebSockets). Always store callback props in a latest-value `useRef` and depend only on primitive resource identifiers (e.g., `videoUrl`).

[ ] Issue: Triggering a full-page loading state (`setIsDocumentLoading(true)`) during a background media token refresh unmounted the `<VideoViewer />` component, wiping out its internal `savedPositionRef` playback timestamp.
Prevention Rule: Background token-refresh handlers must update preview URLs in-place (silently) without toggling container loading flags that unmount the active media player.
```
