import { ArrowUpDown } from "lucide-react";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { cn } from "../../lib/utils";

const columns = [
  { key: "name", label: "Name", className: "w-[40%]" },
  { key: "owner", label: "Owner", className: "w-[20%]" },
  { key: "updated_at", label: "Last Modified", className: "w-[20%]" },
  { key: "file_size", label: "File Size", className: "w-[10%]" },
];

export function DocumentsListHeader({
  onSort,
  sortConfig,
  onSelectAll,
  isAllSelected,
}) {
  return (
    <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-400">
      <div className="w-12">
        <Checkbox
          checked={isAllSelected}
          onCheckedChange={onSelectAll}
          aria-label="Select all items"
        />
      </div>
      {columns.map(({ key, label, className }) => (
        <div key={key} className={cn("flex items-center", className)}>
          <Button
            variant="ghost"
            onClick={() => onSort(key)}
            className="-ml-2 h-auto px-2 py-1"
          >
            {label}
            {sortConfig.key === key && (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </div>
      ))}
      <div className="ml-auto w-16" /> {/* For actions dropdown placeholder */}
    </div>
  );
}
