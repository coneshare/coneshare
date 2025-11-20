import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getUser } from "../../services/api";
import { authService } from "../../services/authService";
import { cn } from "../../lib/utils";
import { Progress } from "../ui/Progress";
import NavUser from "./NavUser";
import { useSidebar } from "./SidebarProvider";
import { formatBytes } from "../../lib/formatters";

function SidebarFooter() {
  const { isCollapsed } = useSidebar();
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await authService.logout();
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("access_token");
      if (token) {
        try {
          const decoded = jwtDecode(token);
          const response = await getUser(decoded.user_id);
          setUser(response.data);
        } catch (error) {
          console.error("Failed to fetch user:", error);
          if (error.response?.status === 401) {
            handleLogout();
          }
        }
      }
    };
    fetchUser();
  }, [handleLogout]);

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
      <NavUser user={user} />
    </div>
  );
}
export default SidebarFooter;
