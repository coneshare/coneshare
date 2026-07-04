import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useSidebar } from "./SidebarProvider";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/Tooltip";

import { useBranding } from "../../contexts/BrandingProvider";

function SidebarHeader() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { brandName, brandLogoUrl, brandWebsiteUrl } = useBranding();

  const logoContent = (
    <>
      <img src={brandLogoUrl} alt={`${brandName} logo`} className="h-6 w-6 object-contain" />
      <span className={cn(isCollapsed && "hidden")}>{brandName}</span>
    </>
  );

  return (
    <div className="flex h-14 items-center border-b px-4">
      {brandWebsiteUrl ? (
        <a
          href={brandWebsiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center gap-2 font-semibold"
          aria-label={`${brandName} Home`}
        >
          {logoContent}
        </a>
      ) : (
        <Link
          to="/"
          className="flex flex-1 items-center gap-2 font-semibold"
          aria-label={`${brandName} Home`}
        >
          {logoContent}
        </Link>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8"
            >
              {isCollapsed ? (
                <ChevronsRight className="h-5 w-5" />
              ) : (
                <ChevronsLeft className="h-5 w-5" />
              )}
              <span className="sr-only">Toggle sidebar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Press ] to toggle sidebar</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
export default SidebarHeader;
