import React from "react";
import { Bot, File, Home, LayoutGrid, UploadCloud, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { useSidebar } from "./SidebarProvider";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/documents", label: "Documents", icon: File },
  { href: "/datarooms", label: "Datarooms", icon: LayoutGrid },
  { href: "/file-requests", label: "File Requests", icon: UploadCloud },
  { href: "/automations", label: "Automations", icon: Bot },
  { href: "/trash", label: "Trash", icon: Trash2, hasDivider: true },
];

export function useNavItems() {
  const { t } = useTranslation();
  return [
    { href: "/", label: t('nav.dashboard'), icon: Home },
    { href: "/documents", label: t('nav.documents'), icon: File },
    { href: "/datarooms", label: t('nav.datarooms'), icon: LayoutGrid },
    { href: "/file-requests", label: t('nav.fileRequests'), icon: UploadCloud },
    { href: "/automations", label: t('nav.automations'), icon: Bot },
    { href: "/trash", label: t('nav.trash'), icon: Trash2, hasDivider: true },
  ];
}

function SidebarContent() {
  const { pathname } = useLocation();
  const { isCollapsed } = useSidebar();
  const navItems = useNavItems();

  return (
    <nav className="mt-4 flex flex-col gap-1 p-2">
      {navItems.map((item) => (
        <React.Fragment key={item.href}>
          {item.hasDivider && (
            <hr className="my-1.5 border-t border-gray-200 dark:border-gray-800" />
          )}
          <Link
            to={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
              (item.href === "/" ? pathname === item.href : pathname.startsWith(item.href)) &&
                "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-50",
              isCollapsed ? "justify-center px-0 h-10 w-10" : "px-3"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className={cn(isCollapsed && "hidden")}>{item.label}</span>
          </Link>
        </React.Fragment>
      ))}
    </nav>
  );
}
export default SidebarContent;
