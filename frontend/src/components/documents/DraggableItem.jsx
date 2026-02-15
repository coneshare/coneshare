import { formatDistanceToNow } from "date-fns";
import { FileIcon, FolderIcon, Star } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { formatBytes } from "../../lib/formatters";
import { ActionsDropdown } from "./ActionsDropdown";
import { Checkbox } from "../ui/Checkbox";
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
  isReadOnly = false,
  showActions = true,
  onItemClick,
}) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(id, type, e);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    // If a child component (like a dropdown menu item) has already handled this
    // event by calling `preventDefault`, do not proceed with navigation.
    if (e.defaultPrevented) {
      return;
    }

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

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`draggable-item-${id}`}
      className={cn(
        `flex w-full cursor-pointer items-center px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50`,
        isSelected && "bg-blue-50 dark:bg-blue-900/20"
      )}
    >
      <div className="w-8">
        {!isReadOnly && (
          <div
            className={cn(
              "transition-opacity",
              isSelected || isHovered || isMenuOpen ? "opacity-100" : "opacity-0"
            )}
            onClick={handleCheckboxClick}
          >
            <Checkbox
              checked={isSelected}
              aria-label={`Select ${item.name}`}
            />
          </div>
        )}
      </div>
      <div className="flex w-[40%] items-center gap-2 truncate">
        {type === "folder" ? (
          <FolderIcon className="h-5 w-5 text-gray-500" />
        ) : (
          <FileIcon className="h-5 w-5 text-gray-500" />
        )}
        <span className="truncate font-medium">{item.name}</span>
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
      <div className="w-[20%] truncate">
        {item.uploader_info ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default">
                {item.uploader_info.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Uploaded by {item.uploader_info.name} ({item.uploader_info.email})
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          item.created_by?.name || "Me"
        )}
      </div>
      <div className="w-[20%]">
        {item.updated_at
          ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
          : "—"}
      </div>
      <div className="w-[10%]">
        {type === "document"
          ? formatBytes(item.file_size)
          : "—"}
      </div>
      <div className="w-16">
        {showActions && !isReadOnly && (
          <div
            className={cn(
              "ml-auto flex justify-end transition-opacity",
              isSelected || isHovered || isMenuOpen ? "opacity-100" : "opacity-0"
            )}
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
              onOpenChange={setIsMenuOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
}
