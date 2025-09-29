import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { BreadcrumbProvider } from "./BreadcrumbProvider";
import { SidebarProvider, useSidebar } from "./SidebarProvider";
import { cn } from "../../lib/utils";

function Layout() {
  const { isCollapsed } = useSidebar();
  return (
    <div
      className={cn(
        "grid h-screen w-full transition-all",
        isCollapsed
          ? "md:grid-cols-[4rem_1fr]"
          : "md:grid-cols-[16rem_1fr]"
      )}
    >
      <Sidebar />
      <div className="flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function MainLayout() {
  return (
    <SidebarProvider>
      <BreadcrumbProvider>
        <Layout />
      </BreadcrumbProvider>
    </SidebarProvider>
  );
}

export default MainLayout;
