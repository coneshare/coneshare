import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, } from "@dnd-kit/core";
import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { deleteDocument, deleteFolder } from "../../services/api";
import { ConfirmationDialog } from "../dialogs/ConfirmationDialog";
import { RenameItemDialog } from "../dialogs/RenameItemDialog";
import { Skeleton } from "../ui/Skeleton";
import { DocumentsListHeader } from "./DocumentsListHeader";
import { DraggableItem } from "./DraggableItem";
import { EmptyDocuments } from "./EmptyDocuments";

function ReadOnlyHeader() {
  return (
    <div className="flex w-full items-center border-b border-gray-200 px-4 py-2 text-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
      <div className="w-8" />
      <div className="w-[40%]">Name</div>
      <div className="w-[20%]">Owner</div>
      <div className="w-[20%]">Last Modified</div>
      <div className="w-[10%]">File Size</div>
      <div className="w-16" />
    </div>
  );
}

export function DocumentsList({
  allItems,
  loading,
  onDataRefresh,
  onFilesDrop,
  selectedDocuments,
  selectedFolders,
  onItemSelect,
  onClearSelection,
  onSort,
  sortConfig,
  onSelectAll,
  isAllSelected,
  onToggleStar,
  isReadOnly = false,
  onItemClick,
}) {
  const [itemToDelete, setItemToDelete] = useState(null);
  const [itemToRename, setItemToRename] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const totalSelectedItem = selectedDocuments.length + selectedFolders.length;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        onFilesDrop(acceptedFiles);
      }
    },
    [onFilesDrop]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: isReadOnly,
  });

  const handleSelect = useCallback(
    (id, type, event) => {
      onItemSelect(id, type, event);
    },
    [onItemSelect]
  );

  const handleDragStart = useCallback(
    (event) => {
      setIsDragging(true);
      const { id } = event.active;
      const item = allItems.find((i) => i.id === id);
      if (item) {
        setDraggedItem(item);
        if (
          (item.type === "document" && !selectedDocuments.includes(id)) ||
            (item.type === "folder" && !selectedFolders.includes(id))
        ) {
          onItemSelect(id, item.type);
        }
      }
    },
    [allItems, selectedDocuments, selectedFolders, onItemSelect]
  );

  const handleDragEnd = async (event) => {
    setIsDragging(false);
    setDraggedItem(null);
    const { over } = event;

    if (over) {
      console.log(`Moved items to folder ${over.id}`);
    }
    onClearSelection();
  };

  const handleRename = (item, type) => setItemToRename({ ...item, type });
  const handleDelete = (item, type) => setItemToDelete({ ...item, type });

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === "document") {
        await deleteDocument(itemToDelete.id);
      } else {
        await deleteFolder(itemToDelete.id);
      }
      toast.success(`"${itemToDelete.name}" deleted successfully.`);
      onDataRefresh();
    } catch (error) {
      console.error(`Failed to delete ${itemToDelete.name}:`, error);
    } finally {
      setItemToDelete(null);
    }
  };

  const handleShare = (document) => {
    console.log(`Share action for: ${document.name} (${document.id})`);
  };

  return (
    <>
      {itemToDelete && (
        <ConfirmationDialog
          isOpen={!!itemToDelete}
          onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}
          title={`Delete "${itemToDelete.name}"?`}
          description="This action cannot be undone. This will permanently delete the item and all of its contents."
          onConfirm={handleConfirmDelete}
          confirmText="Delete"
        />
      )}
      {itemToRename && (
        <RenameItemDialog
          isOpen={!!itemToRename}
          onOpenChange={(isOpen) => !isOpen && setItemToRename(null)}
          item={itemToRename}
          onSuccess={onDataRefresh}
        />
      )}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          {...getRootProps({
            className:
              "relative border-y border-gray-200 dark:border-gray-800",
          })}
        >
          <input {...getInputProps()} />
          {isDragActive && !isReadOnly && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
              <p className="text-lg font-semibold text-primary">
                Drop files or folders to upload
              </p>
            </div>
          )}

          {isReadOnly ? (
            <ReadOnlyHeader />
          ) : (
            <DocumentsListHeader
              onSort={onSort}
              sortConfig={sortConfig}
              onSelectAll={onSelectAll}
              isAllSelected={isAllSelected}
            />
          )}
          {loading ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex h-[53px] items-center px-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="ml-8 h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : allItems.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <EmptyDocuments />
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {allItems.map((item) => (
                <DraggableItem
                  key={item.id}
                  id={item.id}
                  item={item}
                  type={item.type}
                  isSelected={
                    item.type === "folder"
                      ? selectedFolders.includes(item.id)
                      : selectedDocuments.includes(item.id)
                  }
                  onSelect={handleSelect}
                  onRename={() => handleRename(item, item.type)}
                  onDelete={() => handleDelete(item, item.type)}
                  onShare={() => handleShare(item)}
                  onToggleStar={onToggleStar}
                  isReadOnly={isReadOnly}
                  onItemClick={onItemClick}
                />
              ))}
            </div>
          )}
        </div>
        {createPortal(
          <DragOverlay>
            {draggedItem && (
              <div className="relative rounded-lg border bg-white p-2 shadow-md dark:border-gray-700 dark:bg-gray-800">
                <span>{draggedItem.name}</span>
                {totalSelectedItem > 1 && (
                  <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-primary text-xs font-semibold text-primary-foreground">
                    {totalSelectedItem}
                  </div>
                )}
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </>
  );
}
