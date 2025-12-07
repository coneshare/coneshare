import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { BreadcrumbProvider } from "./BreadcrumbProvider";
import { SidebarProvider, useSidebar } from "./SidebarProvider";
import { cn } from "../../lib/utils";
import { UserProvider } from "../../contexts/UserProvider";
import { UploadProgressIndicator } from "../documents/UploadProgressIndicator";

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
      <div className="grid grid-rows-[auto_1fr] overflow-hidden">
        <Header />
        <main className="overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <UploadProgressIndicator />
    </div>
  );
}

function MainLayout() {
  return (
    <SidebarProvider>
      <UserProvider>
        <BreadcrumbProvider>
          <Layout />
        </BreadcrumbProvider>
      </UserProvider>
    </SidebarProvider>
  );
}

export default MainLayout;
