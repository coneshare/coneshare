import { cn } from "../../lib/utils";
import SidebarContent from "./SidebarContent";
import SidebarFooter from "./SidebarFooter";
import SidebarHeader from "./SidebarHeader";
import { useSidebar } from "./SidebarProvider";

function Sidebar() {
  const { isCollapsed } = useSidebar();

  return (
    <aside
      data-collapsed={isCollapsed}
      className={cn(
        "hidden flex-col border-r bg-gray-100/40 transition-all dark:bg-gray-800/40 md:flex data-[collapsed=true]:w-16 data-[collapsed=false]:w-64"
      )}
    >
      <SidebarHeader />
      <SidebarContent />
      <SidebarFooter />
    </aside>
  );
}

export default Sidebar;
