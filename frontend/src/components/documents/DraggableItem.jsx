import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { formatBytes } from "../../lib/formatters";
import { ActionsDropdown } from "./ActionsDropdown";
import { FileTypeIcon } from "./FileTypeIcon";
import { Badge } from "../ui/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/Tooltip";

export function DraggableItem({
  id,
  item,
  type,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  onShare,
  onRequestFiles,
  onToggleStar,
  onDownload,
  onCopy,
  isReadOnly = false,
  showActions = true,
  onItemClick,
  themed = false,
  showIndex = false,
  itemIndex = null,
}) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const handleNameClick = (e) => {
    e.stopPropagation();

    if (onItemClick) {
      onItemClick(item, type);
      return;
    }

    if (type === "folder") {
      navigate(`/documents/folders/${id}`);
    } else if (type === "document") {
      navigate(`/documents/${id}`);
    }
  };

  const handleRowClick = (e) => {
    if (!onSelect) return;
    onSelect(id, type, e);
  };

  const handleRowMouseDown = (e) => {
    // Prevent native browser text selection only for range-selection gesture.
    if (e.shiftKey) {
      e.preventDefault();
    }
  };
  const viewCount = item.view_count ?? item.share_link_view_count ?? item.dataroom_view_count ?? 0;

  return (
    <div
      onClick={handleRowClick}
      onMouseDown={handleRowMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`draggable-item-${id}`}
      className={cn(
        "flex w-full cursor-pointer items-center px-4 py-2 text-sm transition-colors",
        !themed && !isSelected && "hover:bg-gray-50 dark:hover:bg-gray-900/50",
        !themed && isSelected && "bg-blue-100 dark:bg-blue-900/40"
      )}
      style={themed ? {
        backgroundColor: isSelected
          ? "color-mix(in srgb, var(--dataroom-primary) 22%, transparent)"
          : isHovered
            ? "color-mix(in srgb, var(--dataroom-secondary) 10%, transparent)"
            : "transparent",
      } : undefined}
    >
      {showIndex && (
        <div className="w-12 text-xs text-gray-500">
          {itemIndex}
        </div>
      )}
      <div className="flex w-[34%] items-center gap-2 truncate">
        <FileTypeIcon
          type={type === "folder" ? "folder" : item.document_type || "document"}
          className="h-5 w-5 shrink-0"
          palette={themed ? "dataroom" : "default"}
        />
        <button
          type="button"
          className="truncate font-medium text-left hover:underline"
          style={themed ? { color: "var(--dataroom-primary)" } : undefined}
          onClick={handleNameClick}
        >
          {item.name}
        </button>
        {showActions && !isReadOnly && (
          <button
            data-star-button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(id, type);
            }}
            className={cn("ml-auto p-1 mr-1")}
            aria-label={item.is_starred ? `Unstar ${item.name}` : `Star ${item.name}`}
          >
            <Star
              className={cn(
                "h-4 w-4 text-gray-400",
                item.is_starred && "fill-yellow-400 text-yellow-500"
              )}
            />
          </button>
        )}
      </div>
      <div className="w-[18%] truncate" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {item.created_by?.name || "Me"}
        {item.uploader_info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default ml-2">
                {item.uploader_info.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Uploaded by {item.uploader_info.name} ({item.uploader_info.email})
              </p>
            </TooltipContent>
          </Tooltip>
        )}        
      </div>
      <div className="w-[18%]" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {item.updated_at
          ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
          : "—"}
      </div>
      <div className="w-[10%]" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {type === "document"
          ? formatBytes(item.file_size)
          : "—"}
      </div>
      <div className="w-[10%]" style={themed ? { color: "var(--dataroom-secondary)" } : undefined}>
        {type === "document" ? viewCount : "—"}
      </div>
      <div className="ml-auto w-16">
        {showActions && !isReadOnly && (
          <div
            className="ml-auto flex justify-end"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ActionsDropdown
              item={item}
              type={type}
              onRename={onRename}
              onDelete={onDelete}
              onShare={onShare}
              onRequestFiles={onRequestFiles}
              onDownload={onDownload}
              onCopy={onCopy}
            />
          </div>
        )}
      </div>
    </div>
  );
}
