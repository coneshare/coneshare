import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Checkbox } from "../ui/Checkbox";

export function DraggableItem({
  id,
  children,
  isSelected,
  onSelect,
  type,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type },
  });

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(id, type, e);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group relative transition-opacity duration-300 ${isDragging ? "opacity-50" : "opacity-100"}`}
    >
      <div
        className={`absolute -left-2 top-1/2 -translate-y-1/2 transform p-2 transition-opacity duration-200 group-hover:opacity-100 ${
          isSelected ? "opacity-100" : "opacity-0"
        }`}
      >
        <Checkbox
          checked={isSelected}
          /* onCheckedChange={handleCheckboxClick} */
          onClick={handleCheckboxClick}
          aria-label="Select item"
        />
      </div>
      <div className="pl-8">{React.cloneElement(children, { isSelected })}</div>
    </div>
  );
}
