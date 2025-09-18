import { useDroppable } from "@dnd-kit/core";
import { cn } from "../../lib/utils";

export function DroppableFolder({ id, children, disabledFolder, path }) {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
    data: { type: "folder", path },
  });

  const isDisabled = disabledFolder.includes(id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-all duration-200",
        isOver && !isDisabled && "bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-900/50",
        isDisabled && "opacity-50"
      )}
    >
      {children}
    </div>
  );
}
