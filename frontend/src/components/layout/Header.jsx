import { PanelLeft } from "lucide-react";
import { Button } from "../ui/Button";
import { useSidebar } from "./SidebarProvider";

function Header() {
  const { toggleSidebar } = useSidebar();
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
      <h1 className="text-lg font-semibold">Dashboard</h1>
    </header>
  );
}

export default Header;
