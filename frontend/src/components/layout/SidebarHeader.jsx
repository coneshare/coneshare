import { Cone } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "../ui/Skeleton";
import { useSidebar } from "./SidebarProvider";
import { cn } from "../../lib/utils";

function SidebarHeader() {
  const { isCollapsed } = useSidebar();
  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-2",
        isCollapsed ? "items-center" : "items-start"
      )}
    >
      <div className="flex h-10 items-center">
        <Link
          to="/"
          className="flex items-center text-lg font-semibold"
          aria-label="Coneshare Home"
        >
          <Cone className="h-6 w-6" />
          <span className={cn("ml-2", isCollapsed && "hidden")}>
            Coneshare
          </span>
        </Link>
      </div>
      {/* <div className={cn("w-full", isCollapsed ? "px-0" : "px-2")}> */}
      {/*   <Skeleton */}
      {/*     className={cn( */}
      {/*       "w-full", */}
      {/*       isCollapsed ? "h-8 w-8 rounded-full" : "h-10" */}
      {/*     )} */}
      {/*   /> */}
      {/* </div> */}
    </div>
  );
}
export default SidebarHeader;
