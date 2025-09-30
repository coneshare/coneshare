# Coneshare UI: Document List Implementation

This document outlines the key architectural and implementation decisions for the document list feature in Coneshare. The design prioritizes a modern, compact, and interactive user experience similar to Google Drive or Dropbox, moving away from a simple card-based grid.

---

## I. Core Components

The document list is a composite component built from several specialized child components to ensure a clean separation of concerns.

### 1. `DocumentsList.jsx`
-   **Role**: The main container component that orchestrates the entire list view.
-   **Responsibilities**:
    -   Manages the top-level `DndContext` for drag-and-drop functionality.
    -   Renders the `DocumentsListHeader` and the list of `DraggableItem` components.
    -   Handles the main drop zone for file uploads.
    -   Displays loading skeletons and the "empty state" component.

### 2. `DocumentsListHeader.jsx`
-   **Role**: The header row for the document table.
-   **Features**:
    -   Displays sortable column headers ("Name", "Owner", etc.). Clicking a header triggers a sort state change in the parent `DocumentsPage`.
    -   Contains the "Select All" checkbox.

### 3. `DraggableItem.jsx`
-   **Role**: Represents a single row in the list for either a document or a folder.
-   **Responsibilities**:
    -   Provides the draggable handle via `dnd-kit`.
    -   Manages its own hover state to control the visibility of interactive elements.
    -   Handles navigation when the row is clicked.

### 4. `ActionsDropdown.jsx`
-   **Role**: The "three dots" menu for item-specific actions (Rename, Delete, Share).
-   **Implementation**: Built using Radix UI's `DropdownMenu` for accessibility. It is a controlled component that reports its open/closed state back to its parent, `DraggableItem`.

---

## II. Key Implementation Decisions & Challenges

Several critical decisions were made to resolve complex interaction bugs between the UI components and the drag-and-drop library.

### 1. State-Managed Visibility (Hover & Selection)

-   **Problem**: Using CSS `group-hover` to show/hide the checkbox and actions menu caused inconsistent behavior and conflicts with `dnd-kit`'s event listeners.
-   **Solution**: Visibility is now explicitly managed with React state.
    -   `DraggableItem` and `DocumentsListHeader` each have an `isHovered` state, toggled by `onMouseEnter` and `onMouseLeave`.
    -   Elements like the checkbox and actions menu are shown if `isHovered` is true, or if the item `isSelected`.

    *Example from `DraggableItem.jsx`:*
    ```jsx
    const [isHovered, setIsHovered] = useState(false);
    // ...
    <div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className={cn(isHovered || isSelected ? "opacity-100" : "opacity-0")}>
        <Checkbox ... />
      </div>
      // ...
    </div>
    ```

### 2. Preventing Unwanted Navigation on Action Clicks

-   **Problem**: Clicking an item in the `ActionsDropdown` (e.g., "Delete") would cause the dropdown to close, and the click event would then bubble up to the parent `DraggableItem` row, triggering an unwanted navigation to the document detail page.
-   **Solution**: A multi-layered event-stopping strategy was implemented.
    1.  **Dropdown Menu Items**: Each `DropdownMenu.Item` in `ActionsDropdown.jsx` calls both `e.preventDefault()` and `e.stopPropagation()` in its `onSelect` handler. This is the first line of defense.
    2.  **Actions Wrapper**: The `div` wrapping the `ActionsDropdown` component inside `DraggableItem.jsx` has its own event handlers to create a hard boundary. This was the final, critical fix.

    *Example from `DraggableItem.jsx`:*
    ```jsx
    <div
      className={...}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ActionsDropdown ... />
    </div>
    ```
    This ensures that no `click` or `pointerdown` events from within the actions area can ever reach the parent row's navigation handler.

### 3. Keeping the Actions Menu Visible When Open

-   **Problem**: When the user clicks the "three dots" icon, the dropdown menu opens, but the `mouseleave` event on the row can cause the icon itself to disappear, which is disorienting.
-   **Solution**: The `ActionsDropdown` was made a controlled component.
    -   It accepts an `onOpenChange` prop, which is a callback that fires when the menu's open state changes.
    -   `DraggableItem` uses this callback to set an `isMenuOpen` state variable.
    -   The visibility of the actions menu is now tied to `isSelected || isHovered || isMenuOpen`, ensuring it remains visible as long as its menu is open.

    *Example from `DraggableItem.jsx`:*
    ```jsx
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    //...
    <ActionsDropdown onOpenChange={setIsMenuOpen} />
    ```

### 4. Simplified Row Click Handler

-   **Evolution**: The `handleClick` function in `DraggableItem.jsx` initially contained complex logic with `e.target.closest()` to figure out if a click came from an interactive child element.
-   **Final State**: With the robust event-stopping mechanisms in place on all child components, this logic is no longer needed. The handler is now much simpler and relies on the `e.defaultPrevented` flag as a final safeguard.
