import { ArrowUp, ArrowDown, Info } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/Tooltip";

const columns = [
  { key: "name", label: "Name", className: "w-[34%]" },
  { key: "owner", label: "Owner", className: "w-[18%]" },
  { key: "updated_at", label: "Last Modified", className: "w-[18%]" },
  { key: "file_size", label: "Size", className: "w-[10%]" },
  { key: "view_count", label: "Views", className: "w-[10%]" },
];

export function DocumentsListHeader({
  onSort,
  sortConfig,
  themed = false,
  showIndex = false,
  viewsTooltip = "Views recorded for this item.",
}) {
  return (
    <div
      className="flex items-center border-b border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400"
      style={themed ? { color: "var(--dataroom-secondary)" } : undefined}
    >
      {showIndex && <div className="w-12">#</div>}
      {columns.map(({ key, label, className }) => (
        <div key={key} className={cn("flex items-center", className)}>
          <Button
            variant="ghost"
            onClick={() => onSort(key)}
            className={cn("-ml-2 h-auto px-2 py-1", sortConfig.key === key && "font-semibold")}
          >
            {label}
            {sortConfig.key === key &&
              (sortConfig.direction === "ascending" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : (
                <ArrowDown className="ml-2 h-4 w-4" />
              ))}            
          </Button>
          {key === "view_count" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="ml-1 rounded p-1 text-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary dark:hover:text-gray-200"
                  aria-label="About Views"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-56">
                {viewsTooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ))}
      <div className="ml-auto w-16" /> {/* For actions dropdown placeholder */}
    </div>
  );
}
