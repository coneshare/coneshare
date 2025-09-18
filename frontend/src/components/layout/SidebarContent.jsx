import { File, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useSidebar } from "./SidebarProvider";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/documents", label: "Documents", icon: File },
];

function SidebarContent() {
  const { pathname } = useLocation();
  const { isCollapsed } = useSidebar();

  return (
    <nav className="mt-4 flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className={cn(
            "flex items-center gap-3 rounded-lg py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
            pathname === item.href &&
              "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-50",
            isCollapsed ? "justify-center px-0 h-10 w-10" : "px-3"
          )}
        >
          <item.icon className="h-5 w-5" />
          <span className={cn(isCollapsed && "hidden")}>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
export default SidebarContent;
