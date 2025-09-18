import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/Skeleton";
import NavUser from "./NavUser";
import { useSidebar } from "./SidebarProvider";

function SidebarFooter() {
  const { isCollapsed } = useSidebar();
  return (
    <div className="mt-auto flex flex-col gap-2 p-2">
      <div className={cn("space-y-2", isCollapsed && "hidden")}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <NavUser />
    </div>
  );
}
export default SidebarFooter;
