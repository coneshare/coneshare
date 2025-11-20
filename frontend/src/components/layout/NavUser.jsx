import { ChevronsUpDown, CircleUserRound, KeyRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback } from "react";
import { authService } from "../../services/authService";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/Avatar";
import { Button } from "../ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/DropdownMenu";
import { useSidebar } from "./SidebarProvider";
import { cn } from "../../lib/utils";

function NavUser({ user }) {
  const { isCollapsed } = useSidebar();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await authService.logout();
    navigate("/login");
  }, [navigate]);

  if (!user) {
    return null; // Or a skeleton loader
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2",
            isCollapsed ? "h-10 w-10 justify-center p-0" : "px-3"
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar_url || ""} alt={user.name || ""} />
            <AvatarFallback>{user.name?.charAt(0) || "?"}</AvatarFallback>
          </Avatar>
          <div
            className={cn("grid flex-1 text-left", isCollapsed && "hidden")}
          >
            <span className="truncate text-sm font-semibold">{user.name || user.email}</span>
            <span className="truncate text-xs text-gray-500">
              {user.email}
            </span>
          </div>
          <ChevronsUpDown
            className={cn("ml-auto h-4 w-4", isCollapsed && "hidden")}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => navigate("/settings")}>
            <CircleUserRound className="mr-2 h-4 w-4" />
            <span>User Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/settings/password")}>
            <KeyRound className="mr-2 h-4 w-4" />
            <span>Change Password</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NavUser;
