# Coneshare UI: Document List Implementation

This document outlines the key architectural and implementation decisions for the document list feature in Coneshare. The design prioritizes a modern, compact, and interactive user experience similar to Google Drive or Dropbox, moving away from a simple card-based grid.

---

## I. Core Components

The document list is a composite component built from several specialized child components to ensure a clean separation of concerns.

### 1. `DocumentsList.jsx`
-   **Role**: The main container component that orchestrates the entire list view.
-   **Responsibilities**:
    -   Renders the `DocumentsListHeader` and the list of `DraggableItem` components.
    -   Handles the main drop zone for file and folder uploads via `react-dropzone`.
    -   Displays loading skeletons and the "empty state" component.
    -   Hosts internal rename/delete dialogs when external handlers are not provided.

### 2. `DocumentsListHeader.jsx`
-   **Role**: The header row for the document table.
-   **Features**:
    -   Displays sortable column headers ("Name", "Owner", etc.). Clicking a header triggers a sort state change in the parent `DocumentsPage`.
    -   No "Select All" checkbox; selection is row-click driven.

### 3. `DraggableItem.jsx`
-   **Role**: Represents a single row in the list for either a document or a folder.
-   **Responsibilities**:
    -   Handles row selection (`click`, `Cmd/Ctrl+click`, `Shift+click`).
    -   Handles navigation only when the item name is clicked.
    -   Renders per-item actions, star toggle, and row metadata.
    -   Prevents browser text selection during range selection interactions.

### 4. `ActionsDropdown.jsx`
-   **Role**: The "three dots" menu for item-specific actions (Rename, Delete, Share, Copy, Download, Request files).
-   **Implementation**: Built using Radix UI's `DropdownMenu` for accessibility. It is a controlled component that reports its open/closed state back to its parent, `DraggableItem`.

---

## II. Key Implementation Decisions & Challenges

Several critical decisions were made to simplify row interactions and make multi-selection predictable.

### 1. Always-Visible Actions (No Hover Dependency)

-   **Problem**: Hover-gated controls made interaction state harder to follow and introduced extra event complexity.
-   **Solution**: Action controls are always visible. There is no hover-only visibility logic for the actions menu.

### 2. Row Selection Model (No Checkboxes / No Select-All)

-   **Problem**: Checkbox/select-all UI added visual noise and duplicated selection affordances.
-   **Solution**: Selection is driven by natural row clicks:
    -   `click`: select only the clicked row.
    -   `Cmd/Ctrl + click`: toggle row in selection.
    -   `Shift + click`: select range from last selected item.
    -   `Cmd/Ctrl + Shift + click`: add a range to existing selection.
    -   "Clear Selection" action clears all selections.

### 3. Name-Only Navigation

-   **Problem**: Row-click navigation conflicts with row-click selection.
-   **Solution**: Row click is reserved for selection; navigation happens only from clicking the document/folder name button.

### 4. Preventing Action Clicks from Triggering Row Selection

-   **Problem**: Action trigger/menu clicks could otherwise propagate to the row and affect selection.
-   **Solution**: The actions wrapper and dropdown handlers stop propagation (`onClick` / `onPointerDown` / `onSelect`) to isolate action interactions from row selection.

### 5. Selection Visuals and Readability

-   Selected rows use stronger background styling for clearer state visibility.
-   Hover background does not override selected background.
-   File/folder icons are non-shrinking so long names truncate while icon size remains stable.
