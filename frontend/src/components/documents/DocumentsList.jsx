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

function ReadOnlyHeader({ showIndex = false }) {
  return (
    <div className="flex w-full items-center border-b border-gray-200 px-4 py-2 text-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
      {showIndex && <div className="w-12">#</div>}
      <div className="w-[34%]">Name</div>
      <div className="w-[18%]">Owner</div>
      <div className="w-[18%]">Last Modified</div>
      <div className="w-[10%]">Size</div>
      <div className="w-[10%]" title="Views recorded for this item.">Views</div>
      <div className="ml-auto w-16" />
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
  emptyState = null,
}) {
  const [itemToDelete, setItemToDelete] = useState(null);
  const [itemToRename, setItemToRename] = useState(null);
  const indexMap = new Map(
    allItems.map((item, idx) => [`${item.type}:${item.id}`, idx + 1])
  );

  const onDrop = useCallback(
    (acceptedFiles) => {
      if (onFilesDrop && acceptedFiles && acceptedFiles.length > 0) {
        onFilesDrop(acceptedFiles);
      }
    },
    [onFilesDrop]
  );

  const getDroppedFilesAndFolders = useCallback(async (dataTransfer) => {
    const items = dataTransfer.items;
    if (!items) {
      return Array.from(dataTransfer.files || []);
    }

    const traverseFileEntry = (entry, path = "") => {
      return new Promise((resolve) => {
        if (!entry) {
          resolve([]);
          return;
        }
        if (entry.isFile) {
          entry.file(
            (file) => {
              const relativePath = path ? `${path}/${file.name}` : file.name;
              try {
                Object.defineProperty(file, "webkitRelativePath", {
                  value: relativePath,
                  writable: true,
                  configurable: true,
                });
              } catch (err) {
                console.warn("Could not define webkitRelativePath on file object:", err);
                try {
                  file.webkitRelativePath = relativePath;
                } catch (e) {
                  // Ignore fallback failure
                }
              }
              resolve([file]);
            },
            (err) => {
              console.error("Error reading file entry:", err);
              resolve([]);
            }
          );
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          const childFiles = [];

          const readEntriesBatch = () => {
            dirReader.readEntries(
              async (entries) => {
                if (entries.length === 0) {
                  resolve(childFiles);
                } else {
                  const currentPath = path ? `${path}/${entry.name}` : entry.name;
                  for (const childEntry of entries) {
                    const files = await traverseFileEntry(childEntry, currentPath);
                    childFiles.push(...files);
                  }
                  readEntriesBatch();
                }
              },
              (err) => {
                console.error("Error reading directory entries:", err);
                resolve(childFiles);
              }
            );
          };

          readEntriesBatch();
        } else {
          resolve([]);
        }
      });
    };

    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        if (typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        } else {
          return Array.from(dataTransfer.files || []);
        }
      }
    }

    const filesList = [];
    for (const entry of entries) {
      const entryFiles = await traverseFileEntry(entry);
      filesList.push(...entryFiles);
    }

    return filesList;
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled: isReadOnly || !onFilesDrop,
    getFilesFromEvent: async (event) => {
      if (!onFilesDrop) return [];
      if (event.type === "drop" && event.dataTransfer) {
        return await getDroppedFilesAndFolders(event.dataTransfer);
      }
      return Array.from(event.target?.files || []);
    },
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
          title={`Move "${itemToDelete.name}" to Trash?`}
          description="This item will be moved to Trash. You can restore it anytime from Trash."
          onConfirm={handleConfirmDelete}
          confirmText="Move to Trash"
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
            "relative border-t border-gray-200 dark:border-gray-800 min-h-[400px] pb-8",
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
            <ReadOnlyHeader showIndex={showIndex} />
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
            <div className="divide-y divide-gray-200 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex h-[53px] items-center px-4">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="ml-8 h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : allItems.length === 0 ? (
            emptyState ? (
              emptyState
            ) : (
              <div className="flex items-center justify-center py-10">
                <EmptyDocuments />
              </div>
            )
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-800">
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
