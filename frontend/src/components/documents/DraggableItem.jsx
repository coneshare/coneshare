import { useDraggable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import { FileIcon, FolderIcon, Star } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { ActionsDropdown } from "./ActionsDropdown";
import { Checkbox } from "../ui/Checkbox";

function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DraggableItem({
  id,
  item,
  type,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  onShare,
  onToggleStar,
  isReadOnly = false,
  showActions = true,
  onItemClick,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type },
    disabled: isReadOnly,
  });
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
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`draggable-item-${id}`}
      className={cn(
        `flex w-full cursor-pointer items-center px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50`,
        isDragging && "opacity-50",
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
          >
            <Checkbox
              checked={isSelected}
              onClick={handleCheckboxClick}
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
      <div className="w-[20%] truncate">{item.created_by?.name || "Me"}</div>
      <div className="w-[20%]">
        {item.updated_at
          ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
          : "—"}
      </div>
      <div className="w-[10%]">
        {type === "document"
          ? formatFileSize(item.file_size)
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
              onOpenChange={setIsMenuOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
}
