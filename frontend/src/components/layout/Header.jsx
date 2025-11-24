import { useLocation } from "react-router-dom";
import { Breadcrumbs } from "../documents/Breadcrumbs";
import { useBreadcrumb } from "./BreadcrumbProvider";
import { NAV_ITEMS } from "./SidebarContent";
import { DataroomBreadcrumbs } from "../datarooms/DataroomBreadcrumbs";

function Header() {
  const { breadcrumbData } = useBreadcrumb();
  const { pathname } = useLocation();

  // Find the current nav item. Reverse to match more specific paths first (e.g., /documents before /)
  const currentNavItem = NAV_ITEMS.slice()
    .reverse()
    .find((item) => pathname.startsWith(item.href));
  let title = currentNavItem ? currentNavItem.label : "";

  if (pathname.startsWith('/admin/')) {
    title = 'Admin Panel';
  }

  const renderBreadcrumbs = () => {
    if (!breadcrumbData) {
      return <h1 className="text-lg font-semibold">{title}</h1>;
    }

    // Check for an explicit type property for more robust routing
    if (breadcrumbData.type === 'dataroom') {
      return (
        <DataroomBreadcrumbs
          dataroomName={breadcrumbData.dataroomName}
          currentFolder={breadcrumbData.folder}
          onNavigate={breadcrumbData.onNavigate}
        />
      );
    }

    // Default to documents breadcrumbs
    return <Breadcrumbs currentFolder={breadcrumbData} />;
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
      {renderBreadcrumbs()}
    </header>
  );
}

export default Header;
