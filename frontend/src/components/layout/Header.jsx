import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Breadcrumbs } from "../documents/Breadcrumbs";
import { useBreadcrumb } from "./BreadcrumbProvider";
import { useNavItems } from "./SidebarContent";
import { DataroomBreadcrumbs } from "../datarooms/DataroomBreadcrumbs";

function Header() {
  const { t } = useTranslation();
  const { breadcrumbData } = useBreadcrumb();
  const { pathname } = useLocation();
  const navItems = useNavItems();

  // Find the current nav item. Reverse to match more specific paths first (e.g., /documents before /)
  const currentNavItem = navItems.slice()
    .reverse()
    .find((item) => pathname.startsWith(item.href));
  let title = currentNavItem ? currentNavItem.label : "";

  if (pathname.startsWith('/admin')) {
    title = t('nav.adminPanel', 'Admin Panel');
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

    if (breadcrumbData.type === 'fileRequest') {
      return (
        <nav className="flex" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-muted-foreground">
            <li>
              <Link to="/file-requests" className="hover:text-foreground">
                {t('nav.fileRequests', 'File Requests')}
              </Link>
            </li>
            <li className="flex items-center">
              <span className="select-none px-1 text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">{breadcrumbData.fileRequestName}</span>
            </li>
          </ol>
        </nav>
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
