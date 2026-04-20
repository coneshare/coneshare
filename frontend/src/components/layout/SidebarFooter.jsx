import { cn } from "../../lib/utils";
import { BookOpen } from "lucide-react";
import { Progress } from "../ui/Progress";
import NavUser from "./NavUser";
import { useSidebar } from "./SidebarProvider";
import { formatBytes } from "../../lib/formatters";
import { useUser } from "../../contexts/UserProvider";
import { APP_DISPLAY_VERSION } from "../../lib/constants";

function SidebarFooter() {
  const { isCollapsed } = useSidebar();
  const { user } = useUser();

  const quotaMB = user?.file_size_quota_mb || 0;
  const usageBytes = user?.total_document_size || 0;
  const quotaBytes = quotaMB * 1024 * 1024;
  const usagePercentage = quotaMB > 0 ? (usageBytes / quotaBytes) * 100 : 0;

  return (
    <div className="mt-auto flex flex-col gap-4 p-2">
      <a
        href="/api/schema/swagger/"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-3 rounded-lg py-2 text-gray-500 transition-all hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50",
          isCollapsed ? "justify-center px-0 h-10 w-10" : "px-3"
        )}
      >
        <BookOpen className="h-5 w-5" />
        <span className={cn(isCollapsed && "hidden")}>API Docs (Swagger)</span>
      </a>
      {user && (
        <div className={cn("px-2 text-xs", isCollapsed && "hidden")}>
          <div className="mb-2 flex justify-between font-medium text-muted-foreground">
            <span>{formatBytes(usageBytes)} used</span>
            {quotaMB > 0 ? (
              <span>{formatBytes(quotaBytes, 0)}</span>
            ) : (
              <span>Unlimited</span>
            )}
          </div>
          <Progress value={usagePercentage} className="h-2" />
        </div>
      )}
      {APP_DISPLAY_VERSION && (
        <div className={cn("px-2 text-xs text-gray-500 dark:text-gray-400", isCollapsed && "hidden")}>
          {`ver-${APP_DISPLAY_VERSION}`}
        </div>
      )}
      <NavUser />
    </div>
  );
}
export default SidebarFooter;
