# Dataroom Navigation Enhancement Plan

> **Approach:** Option B — In-page single-page navigation  
> **Status:** Approved  
> **Date:** 2026-06-20

## Overview

Replace the current "new tab per document" pattern with in-page navigation where `DataroomViewer` handles both folder listing and document viewing within the same page. This enables sibling browsing, back-to-folder navigation, and eliminates Safari popup issues.

### Why Option B (In-page navigation)

| Criteria | Benefit |
|---|---|
| UX continuity | Single page, smooth transitions — no context switch between tabs |
| Sibling browsing | Already loaded from folder view — no extra API call |
| Safari popup issues | Eliminated — no more `window.open()` workaround |
| Tab management | Single tab for the entire dataroom session |
| Analytics | Continue calling `recordDataroomVisit` on in-page transitions |
| Deep links | URL still encodes `?dataroom_document_id=X&parent_id=Y` |
| Backend changes | None required — existing `getShareLinkViewData` already supports both modes |

---

## Phase 1: DataroomViewer becomes a mini-SPA (Core)

**Goal:** Clicking a document renders the viewer inline instead of opening a new tab.

**File:** `frontend/src/components/viewer/DataroomViewer.jsx`

### State additions
```jsx
const [selectedDocument, setSelectedDocument] = useState(null);
const [documentViewData, setDocumentViewData] = useState(null);
```

### Navigation flow
```
Click document → setSelectedDocument(item) + update URL params
              → fetch document view-data via getShareLinkViewData(?dataroom_document_id=X)
              → render inline document viewer (reuse existing PdfJsViewer / PreviewViewer)
              → show sibling rail + back-to-folder button

Click folder   → unchanged (navigateToScope)
```

### URL encoding
- `?dataroom_document_id=X&parent_id=Y` → viewing document X within folder Y
- `?parent_id=Y` → viewing folder Y listing
- No params → root folder listing

### Key changes
- Replace `window.open()` in `handleItemClick` with `setSelectedDocument(item)`
- Add conditional rendering: if `selectedDocument` → render document viewer; else → render folder listing
- Fire `recordDataroomVisit` before fetching document view-data (preserve analytics)
- Pass `viewId`, `slug`, and dataroom branding through to the inline viewer

### Also modify
- `frontend/src/pages/ShareLinkViewerPage.jsx` — handle `dataroom_document_id` initialization so that direct deep links to a document within a dataroom load the inline viewer state

---

## Phase 2: Sibling Navigation Rail (High Value)

**Goal:** Show a compact list of sibling files/folders so users can quickly switch between documents.

**New component:** `frontend/src/components/viewer/DataroomSiblingNav.jsx`

### Layout
```
┌─────────────────────────────────────────────────┐
│ ← Back to folder    │  Document Name            │
├─────────┬───────────┴───────────────────────────┤
│ Siblings│                                       │
│─────────│                                       │
│ 📄 File1│         Document Viewer               │
│ 📄►File2│      (PDF/Image/Download)             │
│ 📁 Sub  │                                       │
│ 📄 File3│                                       │
│ 📄 File4│                                       │
│         │                                       │
└─────────┴───────────────────────────────────────┘
```

### Features
- Shows all items in the current folder (from `allItems` already in state)
- Current document highlighted with active indicator
- Clicking another document → switches to that document inline
- Clicking a folder → navigates to that folder (exits document view)
- Keyboard: `Alt+↑/↓` to navigate siblings (avoids conflicting with Arrow keys for page nav and `Ctrl+±` for zoom)
- Collapsible on mobile (hamburger or slide-out bottom sheet)
- Virtualized list for folders with > 100 items

### Props
```jsx
<DataroomSiblingNav
  items={allItems}
  selectedDocumentId={selectedDocument?.id}
  onItemClick={handleSiblingClick}
  isCollapsed={isSidebarCollapsed}
  onToggleCollapse={() => setIsSidebarCollapsed(v => !v)}
/>
```

---

## Phase 3: Folder Tree Sidebar for Listing Page (Optional)

**Goal:** Add an optional left sidebar showing the folder tree on the folder listing page.

**New component:** `frontend/src/components/viewer/DataroomFolderTree.jsx`

### Layout
```
┌─────────┬───────────────────────────────────────┐
│ Folders │  Header: Dataroom Name                │
│─────────│───────────────────────────────────────│
│ 📁 Root │  Breadcrumbs: Root > Sub1 > Sub2      │
│  📁 Sub1│───────────────────────────────────────│
│   📁Sub2│  # │ Name        │ Modified │ Size    │
│  📁 Sub3│  1 │ 📄 File.pdf │ 2d ago   │ 1.2 MB │
│ 📁 Other│  2 │ 📄 Doc.docx │ 5d ago   │ 340 KB │
│         │                                       │
└─────────┴───────────────────────────────────────┘
```

### Data considerations
- The backend currently fetches `all_dataroom_folders` internally (in `ShareLinkViewDataView`) for visibility calculations but does **not** expose the tree structure in the API response.
- **Preferred approach:** Add a `folder_tree` field to the dataroom response — lightweight backend change, no migration needed. The data is already queried; just include it in the response.
- **Fallback approach:** Build the tree client-side from breadcrumb data accumulated across navigations (fragile, incomplete for unvisited branches).

### Notes
- This phase is lower priority — breadcrumbs already provide adequate folder navigation
- Consider deferring until user feedback confirms demand

---

## Phase 4: Back-to-folder and Back-to-root Buttons (Quick)

**Goal:** Add clear navigation buttons in the document viewer to return to the parent folder or dataroom root.

### Implementation
Once Phase 1 is done, these are trivial state transitions:

**"← Back to folder"** button:
```jsx
const handleBackToFolder = () => {
  setSelectedDocument(null);
  setDocumentViewData(null);
  // parent_id stays in URL — folder listing re-renders from existing state
};
```

**"⌂ Back to dataroom root"** link:
```jsx
const handleBackToRoot = () => {
  setSelectedDocument(null);
  setDocumentViewData(null);
  navigateToScope(null); // clears parent_id from URL
};
```

### Placement
- Add to the document viewer header bar (top-left, next to dataroom name)
- Also modify `ViewerToolbar.jsx` to include prev/next sibling buttons when in dataroom context

---

## Data Flow (No new API endpoints)

```
User opens dataroom link
  → GET /view-data/?parent_id=null
  → Render folder listing

User clicks a document
  → POST recordDataroomVisit({ dataroomDocumentId })
  → GET /view-data/?dataroom_document_id=X
  → Render document inline + sibling rail from items[]

User clicks sibling document
  → POST recordDataroomVisit({ dataroomDocumentId })
  → GET /view-data/?dataroom_document_id=Y
  → Switch to new document

User clicks "Back to folder"
  → setSelectedDocument(null)
  → Show folder listing (already in state, no re-fetch)
```

---

## Files to Modify

| File | Changes | Phase |
|---|---|---|
| `frontend/src/components/viewer/DataroomViewer.jsx` | Add `selectedDocument` state, inline viewer rendering, URL param management | 1 |
| `frontend/src/pages/ShareLinkViewerPage.jsx` | Pass additional props to DataroomViewer, handle `dataroom_document_id` initialization | 1 |
| New: `frontend/src/components/viewer/DataroomSiblingNav.jsx` | Sibling list rail component | 2 |
| New: `frontend/src/components/viewer/DataroomFolderTree.jsx` | Left sidebar folder tree component | 3 |
| `frontend/src/components/viewer/ViewerToolbar.jsx` | Add sibling prev/next buttons, back-to-folder button | 2, 4 |

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Safari popup blocker | Eliminated — no more `window.open()` |
| Large folder performance | Reuse existing pagination; virtualize sibling rail if > 100 items |
| Analytics regression | Continue calling `recordDataroomVisit` on document switch |
| Deep link support | URL still encodes `?dataroom_document_id=X&parent_id=Y` |
| Keyboard shortcut conflicts | Use `Alt+↑/↓` for sibling nav to avoid conflicts |
| Mobile responsiveness | Sibling rail collapses to bottom sheet or hamburger on small screens |

---

## Implementation Order

1. **Phase 1** (core) → biggest UX win, enables all other phases
2. **Phase 2** (high value) → sibling rail for quick browsing
3. **Phase 4** (quick) → back-to-folder/root buttons, trivial once Phase 1 is done
4. **Phase 3** (optional) → folder tree sidebar, consider deferring based on user feedback
