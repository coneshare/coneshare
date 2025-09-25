import { PanelLeft } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Breadcrumbs } from "../documents/Breadcrumbs";
import { Button } from "../ui/Button";
import { useBreadcrumb } from "./BreadcrumbProvider";
import { NAV_ITEMS } from "./SidebarContent";
import { useSidebar } from "./SidebarProvider";

function Header() {
  const { toggleSidebar } = useSidebar();
  const { breadcrumbData } = useBreadcrumb();
  const { pathname } = useLocation();

  // Find the current nav item. Reverse to match more specific paths first (e.g., /documents before /)
  const currentNavItem = NAV_ITEMS.slice()
    .reverse()
    .find((item) => pathname.startsWith(item.href));
  const title = currentNavItem ? currentNavItem.label : "";

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-gray-100/40 px-6 dark:bg-gray-800/40">
      <Button
        variant="ghost"
        size="icon"
        className="hidden h-8 w-8 md:inline-flex"
        onClick={toggleSidebar}
      >
        <PanelLeft className="h-5 w-5" />
        <span className="sr-only">Toggle Sidebar</span>
      </Button>
      {breadcrumbData ? (
        <Breadcrumbs currentFolder={breadcrumbData} />
      ) : (
        <h1 className="text-lg font-semibold">{title}</h1>
      )}
    </header>
  );
}

export default Header;
