import { cn } from "../../lib/utils";
import { Progress } from "../ui/Progress";
import NavUser from "./NavUser";
import { useSidebar } from "./SidebarProvider";
import { formatBytes } from "../../lib/formatters";
import { useUser } from "../../contexts/UserProvider";

function SidebarFooter() {
  const { isCollapsed } = useSidebar();
  const { user } = useUser();

  const quotaMB = user?.file_size_quota_mb || 0;
  const usageBytes = user?.total_document_size || 0;
  const quotaBytes = quotaMB * 1024 * 1024;
  const usagePercentage = quotaMB > 0 ? (usageBytes / quotaBytes) * 100 : 0;

  return (
    <div className="mt-auto flex flex-col gap-4 p-2">
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
      <NavUser />
    </div>
  );
}
export default SidebarFooter;
