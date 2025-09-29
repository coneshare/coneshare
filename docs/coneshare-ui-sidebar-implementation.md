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

-   **Logo & Branding**: Displays a compact icon when the sidebar is collapsed and the full logo and application name ("Coneshare") when it is expanded. This component provides a consistent brand presence at the top of the navigation.

### 2. `SidebarContent`

-   **Navigation**: The main navigation links (defined in a `NAV_ITEMS` array) are rendered here.
-   **Active State**: The component uses `useLocation` from `react-router-dom` to highlight the link corresponding to the current page.
-   **Future-Proofing**: The `NAV_ITEMS` data structure is designed to be easily extended to support nested routes for collapsible submenus in the future.

### 3. `SidebarFooter` & `NavUser`

-   The `SidebarFooter` component renders the `NavUser` component and includes generic `Skeleton` placeholders for future functionality.
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
-   Child components consume the `isCollapsed` boolean from the `useSidebar()` hook. They use this state with a utility like `cn()` to conditionally apply classes (e.g., `"hidden"`). This allows elements like text labels to be hidden when the sidebar is collapsed, leaving only the icons visible.

---

## VI. Final Implementation for Sticky Footer

After several iterations, a robust solution was implemented to ensure the sidebar footer remains sticky at the bottom of the viewport, regardless of the main content's length. The core issue was that the main content area was stretching the entire page layout, which in turn stretched the sidebar and pushed the footer off-screen.

The final solution involves two key parts that work together:

### 1. Constraining the Main Layout

-   **File**: `src/components/layout/MainLayout.jsx`
-   **Change**: The root grid container's height was fixed to the viewport height by changing `min-h-screen` to `h-screen`.
-   **Change**: The `div` wrapping the main content area (containing the `Header` and `<main>`) was given the `overflow-hidden` class.

**Why it works**: These changes prevent the main grid from growing beyond the screen height. The `overflow-hidden` class ensures that the content `div` does not stretch its parent grid cell, effectively containing the layout.

*Example from `src/components/layout/MainLayout.jsx`:*
```jsx
<div
  className={cn(
    "grid h-screen w-full ...", // Fixed height
    ...
  )}
>
  <Sidebar />
  <div className="flex flex-col overflow-hidden"> // Prevents stretching
    <Header />
    <main className="flex-1 overflow-auto ..."> // This now scrolls independently
      <Outlet />
    </main>
  </div>
</div>
```

### 2. Leveraging Flexbox in the Sidebar

-   **File**: `src/components/layout/Sidebar.jsx` & `SidebarFooter.jsx`
-   **Structure**: The `Sidebar` component uses `flex flex-col`.
-   **Mechanism**: With the sidebar's height now constrained by the main layout, the `mt-auto` utility class on the `SidebarFooter` correctly pushes it to the bottom of the available vertical space within the sidebar.

This combination ensures the sidebar and main content areas have independent scrolling behavior, providing the desired user experience where the sidebar footer is always visible.
