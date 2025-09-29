import { useDraggable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import { FileIcon, FolderIcon, Star } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { ActionsDropdown } from "./ActionsDropdown";
import { Checkbox } from "../ui/Checkbox";

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
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type },
  });
  const navigate = useNavigate();

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(id, type, e);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (
      e.target.closest('[role="checkbox"]') ||
      e.target.closest("[data-radix-dropdown-menu-trigger]") ||
      e.target.closest("[data-star-button]")
    ) {
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
      className={cn(
        `group flex w-full cursor-pointer items-center px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50`,
        isDragging && "opacity-50",
        isSelected && "bg-blue-50 dark:bg-blue-900/20"
      )}
    >
      <div className="w-12">
        <div
          className={cn(
            "transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <Checkbox
            checked={isSelected}
            onClick={handleCheckboxClick}
            aria-label={`Select ${item.name}`}
          />
        </div>
      </div>
      <div className="flex w-[40%] items-center gap-2 truncate">
        {type === "folder" ? (
          <FolderIcon className="h-5 w-5 text-gray-500" />
        ) : (
          <FileIcon className="h-5 w-5 text-gray-500" />
        )}
        <span className="truncate font-medium">{item.name}</span>
        <button
          data-star-button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(id, type);
          }}
          className={cn("ml-auto p-1")}
        >
          <Star
            className={cn(
              "h-4 w-4 text-gray-400",
              item.is_starred && "fill-yellow-400 text-yellow-500"
            )}
          />
        </button>
      </div>
      <div className="w-[20%] truncate">{item.created_by?.name || "Me"}</div>
      <div className="w-[20%]">
        {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
      </div>
      <div className="w-[10%]">
        {type === "document" && item.file_size
          ? `${(item.file_size / 1024).toFixed(1)} KB`
          : "—"}
      </div>
      <div
        className={cn(
          "ml-auto flex w-16 justify-end transition-opacity",
          isSelected
            ? ""
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        <ActionsDropdown
          item={item}
          type={type}
          onRename={onRename}
          onDelete={onDelete}
          onShare={onShare}
        />
      </div>
    </div>
  );
}
