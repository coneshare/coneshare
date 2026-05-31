import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { deleteDocument, deleteFolder } from "../../services/api";
import { ConfirmationDialog } from "../dialogs/ConfirmationDialog";
import { RenameItemDialog } from "../dialogs/RenameItemDialog";
import { Skeleton } from "../ui/Skeleton";
import { DocumentsListHeader } from "./DocumentsListHeader";
import { DraggableItem } from "./DraggableItem";
import { EmptyDocuments } from "./EmptyDocuments";
import { TooltipProvider } from "../ui/Tooltip";

function ReadOnlyHeader() {
  return (
    <div className="flex w-full items-center border-b border-gray-200 px-4 py-2 text-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
      <div className="w-8" />
      <div className="w-[34%]">Name</div>
      <div className="w-[18%]">Owner</div>
      <div className="w-[18%]">Last Modified</div>
      <div className="w-[10%]">Size</div>
      <div className="w-[10%]" title="Views recorded for this item.">Views</div>
      <div className="w-16" />
    </div>
  );
}

export function DocumentsList({
  allItems,
  loading,
  onDataRefresh,
  onFilesDrop,
  selectedDocuments = [],
  selectedFolders = [],
  onItemSelect,
  onClearSelection,
  onSort,
  sortConfig,
  onToggleStar,
  isReadOnly = false,
  showActions = true,
  onItemClick,
  onRename,
  onDelete,
  onShare,
  onRequestFiles,
  onDownload,
  onCopy,
  themed = false,
  showIndex = false,
  viewsTooltip = "Views recorded for this item.",
}) {
  const [itemToDelete, setItemToDelete] = useState(null);
  const [itemToRename, setItemToRename] = useState(null);
  const indexMap = new Map(
    allItems.map((item, idx) => [`${item.type}:${item.id}`, idx + 1])
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

  const handleContainerClick = (event) => {
    if (event.target === event.currentTarget) {
      onClearSelection?.();
    }
  };


  const internalHandleRename = (item) => setItemToRename(item);
  const internalHandleDelete = (item) => setItemToDelete(item);

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

  return (
    <TooltipProvider>
      {!onDelete && itemToDelete && (
        <ConfirmationDialog
          isOpen={!!itemToDelete}
          onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}
          title={`Delete "${itemToDelete.name}"?`}
          description="This action cannot be undone. This will permanently delete the item and all of its contents."
          onConfirm={handleConfirmDelete}
          confirmText="Delete"
        />
      )}
      {!onRename && itemToRename && (
        <RenameItemDialog
          isOpen={!!itemToRename}
          onOpenChange={(isOpen) => !isOpen && setItemToRename(null)}
          item={itemToRename}
          onSuccess={onDataRefresh}
        />
      )}
      <div
        {...getRootProps({
          className:
            "relative border-y border-gray-200 dark:border-gray-800",
          onClick: handleContainerClick,
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
              themed={themed}
              showIndex={showIndex}
              viewsTooltip={viewsTooltip}
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
                  onRename={onRename || internalHandleRename}
                  onDelete={onDelete || internalHandleDelete}
                  onShare={onShare}
                  onRequestFiles={onRequestFiles}
                  onToggleStar={onToggleStar}
                  isReadOnly={isReadOnly}
                  showActions={showActions}
                  onItemClick={onItemClick}
                  onDownload={onDownload}
                  onCopy={onCopy}
                  themed={themed}
                  showIndex={showIndex}
                  itemIndex={showIndex ? indexMap.get(`${item.type}:${item.id}`) : null}
                />
              ))}
            </div>
          )}
        </div>
    </TooltipProvider>
  );
}
