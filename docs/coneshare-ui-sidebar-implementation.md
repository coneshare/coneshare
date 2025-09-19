# Coneshare UI/UX: Sidebar Implementation

This document outlines the UI/UX decisions and implementation plan for the primary navigation sidebar in Coneshare. The design is inspired by modern application layouts (referencing Papermark's implementation) and is built to be responsive, accessible, and extensible.

---

## I. Core Principles

-   **Component-Based Architecture**: The sidebar is broken down into logical, reusable components for maintainability.
-   **Centralized State Management**: A single React Context (`SidebarProvider`) manages the sidebar's state, making it reliably accessible throughout the application.
-   **Accessibility**: Keyboard shortcuts and semantic component structure are included to provide a better user experience.
-   **Responsive Design**: The sidebar adapts its layout for different screen sizes and collapsed states using modern CSS techniques.

---

## II. Component Structure

The sidebar is composed of three primary sections, allowing for a clear separation of concerns:

-   **`SidebarHeader`**: Contains branding (logo) and team-level context (e.g., a team switcher).
-   **`SidebarContent`**: Houses the main navigation links.
-   **`SidebarFooter`**: Contains user-specific controls, settings, and other metadata.

This structure is implemented in the main `Sidebar` component.

*Example from `src/components/layout/Sidebar.jsx`:*
```jsx
import SidebarHeader from "./SidebarHeader";
import SidebarContent from "./SidebarContent";
import SidebarFooter from "./SidebarFooter";

return (
  <aside ...>
    <SidebarHeader />
    <SidebarContent />
    <SidebarFooter />
  </aside>
);
```

---

## III. State Management: The Toggleable Sidebar

The sidebar's core interactive feature is its ability to be toggled between an expanded and collapsed state. This is managed through a dedicated `SidebarProvider`.

### 1. Sidebar Context (`SidebarProvider`)

-   **Purpose**: Manages the `isCollapsed` boolean state and provides a `toggleSidebar` function to all child components.
-   **Implementation**: Uses `React.createContext` to create the context. A custom `useSidebar` hook is exported for easy and clean consumption by other components.

### 2. Layout Integration (`MainLayout`)

-   **Purpose**: The main application layout must adapt when the sidebar's state changes to prevent content from being obscured.
-   **Implementation**: The `MainLayout` component is wrapped with `SidebarProvider`. It uses the `isCollapsed` state from the `useSidebar()` hook to dynamically adjust its CSS grid columns, allowing the main content area to expand and fill the space left by the collapsed sidebar.

*Example from `src/components/layout/MainLayout.jsx`:*
```jsx
<div
  className={cn(
    "grid ...",
    isCollapsed ? "md:grid-cols-[4rem_1fr]" : "md:grid-cols-[16rem_1fr]"
  )}
>
...
</div>
```

### 3. User Controls

-   **Toggle Button**: A button is placed in the main `Header` component. It calls the `toggleSidebar` function from the context on click.
-   **Keyboard Shortcut**: For improved accessibility and efficiency, a global keyboard shortcut (`[`) is implemented within the `SidebarProvider` using a `useEffect` hook that listens for `keydown` events.

---

## IV. Detailed Component Implementation

### 1. `SidebarHeader`

-   **Logo**: Displays a compact icon when the sidebar is collapsed and the full logo and application name when it is expanded.
-   **Team Switcher**: Includes a placeholder for a future team-switching component. A `Skeleton` loader is used to represent the initial loading state.

### 2. `SidebarContent`

-   **Navigation**: The main navigation links (defined in a `NAV_ITEMS` array) are rendered here.
-   **Active State**: The component uses `useLocation` from `react-router-dom` to highlight the link corresponding to the current page.
-   **Future-Proofing**: The `NAV_ITEMS` data structure is designed to be easily extended to support nested routes for collapsible submenus in the future.

### 3. `SidebarFooter` & `NavUser`

-   The `SidebarFooter` component renders the `NavUser` component and includes `Skeleton` placeholders for future features like `UsageProgress` and `ProBanner`.
-   The `NavUser` component is a user profile dropdown menu built with Radix UI primitives for accessibility.
    -   The trigger is a `Button` showing the user's avatar, name, and email.
    -   The dropdown content includes links to user settings and a logout action, complete with icons.

---

## V. Styling for Collapsed State

To create a clean and responsive collapsed state, the implementation relies on data attributes and Tailwind CSS variants, a modern and maintainable approach.

-   The root `<aside>` element of the sidebar has a `data-collapsed` attribute that is toggled true/false based on the `isCollapsed` state from the context.
    
    *Example from `src/components/layout/Sidebar.jsx`:*
    ```jsx
    <aside
      data-collapsed={isCollapsed}
      className="... data-[collapsed=true]:w-16 data-[collapsed=false]:w-64"
    >
    ```
-   Child components then use Tailwind's data attribute variants (e.g., `data-[collapsed=true]:hidden`) to responsively show or hide elements like text labels. When collapsed, only icons are visible. This is a clean and efficient way to manage conditional styling directly in the markup without cluttering components with conditional rendering logic.
