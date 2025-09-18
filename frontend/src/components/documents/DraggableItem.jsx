import { useDraggable } from "@dnd-kit/core";
import { Checkbox } from "../ui/Checkbox";

export function DraggableItem({
  id,
  children,
  isSelected,
  onSelect,
  isDraggingSelected,
  type,
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type },
  });

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(id, type);
  };

  const showCheckbox = isSelected || !isDraggingSelected;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`relative transition-opacity duration-300 ${isDragging ? "opacity-50" : "opacity-100"}`}
    >
      <div
        className={`absolute -left-2 top-1/2 -translate-y-1/2 transform p-2 transition-opacity duration-200 ${
          showCheckbox ? "opacity-100" : "opacity-0"
        }`}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxClick}
          onClick={handleCheckboxClick}
          aria-label="Select item"
        />
      </div>
      <div className={`${isSelected ? "pl-8" : ""}`}>{children}</div>
    </div>
  );
}
