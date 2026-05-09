import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";

const columns = [
  { key: "name", label: "Name", className: "w-[40%]" },
  { key: "owner", label: "Owner", className: "w-[20%]" },
  { key: "updated_at", label: "Last Modified", className: "w-[20%]" },
  { key: "file_size", label: "Size", className: "w-[10%]" },
];

export function DocumentsListHeader({
  onSort,
  sortConfig,
  themed = false,
  showIndex = false,
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
        </div>
      ))}
      <div className="ml-auto w-16" /> {/* For actions dropdown placeholder */}
    </div>
  );
}
