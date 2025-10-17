import { useLocation } from "react-router-dom";
import { Breadcrumbs } from "../documents/Breadcrumbs";
import { useBreadcrumb } from "./BreadcrumbProvider";
import { NAV_ITEMS } from "./SidebarContent";

function Header() {
  const { breadcrumbData } = useBreadcrumb();
  const { pathname } = useLocation();

  // Find the current nav item. Reverse to match more specific paths first (e.g., /documents before /)
  const currentNavItem = NAV_ITEMS.slice()
    .reverse()
    .find((item) => pathname.startsWith(item.href));
  const title = currentNavItem ? currentNavItem.label : "";

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
      {breadcrumbData ? (
        <Breadcrumbs currentFolder={breadcrumbData} />
      ) : (
        <h1 className="text-lg font-semibold">{title}</h1>
      )}
    </header>
  );
}

export default Header;
