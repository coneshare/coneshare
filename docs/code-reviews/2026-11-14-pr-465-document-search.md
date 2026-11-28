# Code Review — `f8590b3` *(code-reviewer skill + CodeRabbit merged)*
**feat(documents): support document search by filename and description in Web UI and MCP (#388)**

PR: https://github.com/coneshare/coneshare/pull/465 — 26 files, +1275 / −161, branch `feat.search_documents`

Sources merged here:
- Own review of the commit diff (this skill, checked against `docs/tech_stack_guidelines.md` Rules 1–13).
- CodeRabbit: 2 reviews (at `dc30b3aa` on 11-06 and at `f8590b38` on 11-13), 10 inline threads, 1 nitpick. All 10 threads are still **unresolved**, and 2 of them are marked outdated.

Tests run: none. Findings come from reading the diff and the PR comments.

---

## Verdict
The feature is sound: access scoping is right and it adds no secrets. But three of CodeRabbit's findings are real bugs, and one of them is a **test regression**:
- The MCP contract test lost its upload assertions.
- The `/search/` action 404s when `?search=` is used.
- Several frontend fetches have stale-response races.

Fix the "Must fix" items before merge.

---

## What Checks Out
- No hardcoded secrets. Query strings are trimmed and capped at 200 chars (`[:200]`) on every new entry point.
- Access control:
  - `DocumentViewSet.list` search stays inside `get_queryset()` (own documents in own org) and now excludes Vault folders.
  - A `folder` filter requires `created_by=request.user` and a personal folder.
  - `DataroomViewSet.search_content` goes through `self.get_object()`, so only users who can reach the dataroom can search it.
  - Results are capped at 100 per type.
- Rule 12 (permissions at depth): the new `/search/` endpoint is owner/collaborator-only, so `is_visible` / `allow_download` do not apply to it.
- `location` is built from an in-memory folder map. The `FolderSerializer` `folder_parent_map` path avoids the N+1 ancestor queries.
- i18n: `noSearchResults` and `noSearchResultsDescription` are added to all 6 locale catalogs, and the new `t()` calls use no inline `defaultValue` (Rule 10 respected in new code).
- Tests were added in every layer: backend views, MCP contract and unit, `SearchBox`, and the three pages.
- Python is `snake_case` and JS identifiers are camelCase.

---

## Findings (merged)

Legend: **Mine** = found in own review, **CR** = CodeRabbit, **Both** = same issue found by both. Status says what I verified.

### Must fix
| # | File | Issue | Source | Status |
|---|------|-------|--------|--------|
| 1 | `backend/tests/test_mcp_contracts.py:155-157` | The commit deleted the `upload_url` / `storage_key` / `unique_name` assertions from the existing upload contract test. They were replaced by the new `test_search_documents_endpoint_contract`. The upload test now passes even if the handshake fields are missing. **Fix:** restore the three assertions in the upload test, above the new test. | **Both** | **Confirmed in diff.** Major in practice, though CR rated it minor. |
| 2 | `backend/datarooms/views.py:150-152` | `get_queryset()` applies `name__icontains=search` for **every** action. `search_content` calls `get_object()`, which uses that queryset. So `/datarooms/{id}/search/?search=budget` filters out a room named "Deal Room" and returns 404. The view accepts `search` as an alias for `q`, so this is reachable. **Fix:** guard the name filter with `self.action == 'list'`, or stop accepting `search` on the detail action. Add a regression test. | **CR** | **Confirmed in diff.** |
| 3 | `frontend/src/pages/DataroomPage.jsx:288-300` | `fetchContent` writes `setSearchResults` with no stale-response guard. A refresh after a rename or upload for query A can finish after query B and overwrite B's results. The effect's `cancelled` flag does not cover this path. **Fix:** share a request-sequence ref (as `DocumentsPage` does with `fetchSeqRef`) across both writers, including the folder branch. | **CR** | Likely valid: the writes are visible at lines 288/300 with no guard. |
| 4 | `frontend/src/pages/DataroomsPage.jsx:~79-85` | Same race in `fetchDatarooms`. Earlier request A can overwrite `datarooms` after B, and A's `finally` can clear `isLoading` while B is pending. **Fix:** request id or `AbortController`, applied to both the state write and the `finally`. | **CR** | Likely valid (same pattern as 3). |

### Should fix
| # | File | Issue | Source | Status |
|---|------|-------|--------|--------|
| 5 | `frontend/src/pages/DataroomPage.jsx:604` | `item.folder \|\| currentFolderId` turns an explicit `null` (root-level result) into the current folder. Opening a root-level hit while searching inside a subfolder sends the wrong `from_folder` and breaks the breadcrumb. **Fix:** use `'folder' in item ? item.folder : currentFolderId`. | **CR** | **Confirmed in code.** |
| 6 | `frontend/src/pages/DataroomsPage.jsx:~94-98` | `searchInput` reads the URL only at init. Browser Back/Forward restores an older `?search=`, then the debounced input overwrites it. **Fix:** sync URL changes into the input, and tell them apart from pending edits. | **CR** | Likely valid. |
| 7 | `mcp-server/coneshare_mcp/tools/documents.py:38` | The tool docstring says "full-text", but the backend does a single `icontains` on the whole query. "annual report" will not match "Annual Financial Report.pdf". **Fix:** change the docstring to "case-insensitive substring in title or description" (CR's suggested text), or add token matching. | **CR** | **Confirmed in diff.** |
| 8 | `mcp-server/.../client.py:190-200` + backend | The MCP tool sends `page` and `page_size`, but `DocumentViewSet.list` returns an unpaginated list when no paginator is configured. The client then slices it in memory (`_paginate`). So every call loads all matches (no DB limit). The tool schema advertises pagination that does not exist server-side. **Fix:** cap server-side or paginate in the backend. | **Mine** | Needs checking: confirm the project's DRF pagination setting. |
| 9 | `frontend/src/components/SearchBox.jsx` | `placeholder = "Search..."` and the `aria-label`s `"Loading"` and `"Clear search"` are hardcoded English. They are not in the 6 locale catalogs (Rules 7 and 10). **Fix:** take translated labels as props (callers use `t()`), or call `useTranslation` and add keys to all catalogs. | **Mine** | **Confirmed in diff.** |
| 10 | `frontend/src/tests/pages/DocumentsPage.test.jsx:~1258` | The debounce test passes even if intermediate requests are sent. **Fix:** use fake timers: no request before 300 ms, exactly one after rapid input. | **CR** (nitpick) | Valid, low value. |

### Probably already resolved or stale
| # | File | Issue | Source | Status |
|---|------|-------|--------|--------|
| 11 | `DocumentsPage.jsx:140-144` | Searching inside a subfolder clears `currentFolder` and breadcrumb, so uploads during search land in root. | **CR** | Outdated thread. HEAD adds a `fetchSeqRef` guard and keeps the `folder` filter in search, but check that uploads during a search still use the right folder. |
| 12 | `DocumentsPage.jsx:171` | An upload-completion refresh uses the query captured when the upload started and can replace search results with the folder listing. | **CR** | Outdated thread. `fetchData` now depends on `effectiveSearch`. Please confirm with a test. |
| 13 | `DocumentsPage.jsx:~617/676` | `searchPlaceholder` says "files and folders" in 5 locales, but search returns only documents. | **CR** | Probably obsolete: the commit adds `/folders/search/` and `searchFolders`, so folders are searched. The German and French strings differ from the others. Check that the German placeholder ("Dokumente durchsuchen") is acceptable. |

### Minor (own review)
- `DataroomViewSet.search_content` returns folders sorted by name and documents sorted by `created_at`, merged through `build_ordered_dataroom_items`. Result ordering is not relevance-based. This is acceptable, but document it.
- `search_content` does not check dataroom folders for soft deletion. It does exclude deleted documents. Confirm that dataroom folders are hard-deleted.
- The `/datarooms/{id}/search/` and `/folders/search/` endpoints need tests for the empty-query case (the empty `{'items': []}` path), and a cross-org or non-collaborator 404.

---

## Visitor access
The search is **owner/collaborator only**. There is no search for share-link visitors in `sharelinks/views.py` or the public viewer. A visitor-facing search would need its own public endpoint that respects `ShareLinkDataroomSetting.is_visible`, and must not leak hidden parent folder names in `location`.

---

## Checklist to close the PR
- [ ] 1 Restore upload assertions in `test_mcp_contracts.py`
- [ ] 2 Guard dataroom-name filter with `self.action == 'list'` + regression test
- [ ] 3, 4 Stale-response guards in `DataroomPage` and `DataroomsPage`
- [ ] 5 Preserve explicit `null` folder
- [ ] 6 Sync URL search into input on Back/Forward
- [ ] 7 Fix MCP docstring (substring, not full-text)
- [ ] 8 Resolve MCP pagination mismatch
- [ ] 9 Localize `SearchBox` labels
- [ ] 10 Fake-timer debounce test
- [ ] Resolve or dismiss threads 11–13 on GitHub

# Proposed Additions to Long-Term Memory
(not yet written — awaiting approval)
