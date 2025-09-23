import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, } from "@dnd-kit/core";
import { FileIcon, FolderIcon, } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import * as React from 'react';
import { createPortal } from "react-dom";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { deleteDocument, deleteFolder } from "../../services/api";
import { ConfirmationDialog } from "../dialogs/ConfirmationDialog";

import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Skeleton } from "../ui/Skeleton";
import DocumentCard from "./DocumentCard";
import { DraggableItem } from "./DraggableItem";
import { DroppableFolder } from "./DroppableFolder";
import { EmptyDocuments } from "./EmptyDocuments";
import FolderCard from "./FolderCard";


export function DocumentsList({
  folders,
  documents,
  loading,
  foldersLoading,
  onDataRefresh,
  onFilesDrop,
}) {
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [itemToDelete, setItemToDelete] = useState(null);

  const [draggedDocument, setDraggedDocument] = useState(null);
  const [draggedFolder, setDraggedFolder] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const totalSelectedItem = [...selectedDocuments, ...selectedFolders].length;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  const selectedDocumentsLength = useMemo(
    () => selectedDocuments && selectedDocuments.length,
    [selectedDocuments]
  );

  const selectedFoldersLength = useMemo(
    () => selectedFolders && selectedFolders.length,
    [selectedFolders]
  );

  const onDrop = useCallback(
    (acceptedFiles) => {
      // When a folder is dropped, react-dropzone provides a list of all files
      // within it. Each file object is augmented with a `path` property
      // representing its relative path inside the folder. We use this to
      // reconstruct the folder structure on the server.
      if (acceptedFiles && acceptedFiles.length > 0) {
        onFilesDrop(acceptedFiles);
      }
    },
    [onFilesDrop]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true, // We have dedicated buttons for click-to-upload
    noKeyboard: true,
  });

  const handleSelect = useCallback((id, type) => {
    if (type === "folder") {
      setSelectedFolders((prev) =>
        prev.includes(id)
          ? prev.filter((docId) => docId !== id)
          : [...prev, id]
      );
    } else {
      setSelectedDocuments((prev) =>
        prev.includes(id)
          ? prev.filter((docId) => docId !== id)
          : [...prev, id]
      );
    }
  }, []);

  const handleDragForType = useCallback(
    (itemId, items, setDraggedItem, selectedItems, setSelectedItems) => {
      if (!items) return;

      const draggedItem = items.find((item) => item.id === itemId) ?? null;
      setDraggedItem(draggedItem);

      const isSelected = selectedItems.includes(itemId);
      if (!isSelected) {
        setSelectedItems([...selectedItems, itemId]);
      }
    },
    []
  );

  const handleDragStart = useCallback(
    (event) => {
      setIsDragging(true);
      const { type } = event.active.data.current ?? {};
      const itemId = event.active.id;

      if (type === "document") {
        handleDragForType(
          itemId,
          documents,
          setDraggedDocument,
          selectedDocuments,
          setSelectedDocuments
        );
      }

      if (type === "folder") {
        handleDragForType(
          itemId,
          folders,
          setDraggedFolder,
          selectedFolders,
          setSelectedFolders
        );
      }
    },
    [handleDragForType, documents, folders, selectedDocuments, selectedFolders]
  );

  const handleDragEnd = async (event) => {
    setIsDragging(false);
    const { over } = event;
    setDraggedDocument(null);
    setDraggedFolder(null);

    if (over) {
      console.log(`Moved items to folder ${over.id}`);
      // Here you would call an API to move the files
      // For now, we just reset selection
    }

    setSelectedDocuments([]);
    setSelectedFolders([]);
  };

  const resetSelection = () => {
    setSelectedDocuments([]);
    setSelectedFolders([]);
  };

  const handleRename = (item) => {
    // In a real implementation, this would open a rename modal.
    console.log(`Rename action for: ${item.name} (${item.id})`);
  };

  const handleDelete = (item, type) => {
    setItemToDelete({ ...item, type });
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === "document") {
        await deleteDocument(itemToDelete.id);
        toast.success(`Document "${itemToDelete.name}" deleted successfully.`);
      } else {
        await deleteFolder(itemToDelete.id);
        toast.success(`Folder "${itemToDelete.name}" deleted successfully.`);
      }
      onDataRefresh();
    } catch (error) {
      // Interceptor will show a generic error toast
      console.error(`Failed to delete ${itemToDelete.name}:`, error);
    } finally {
      setItemToDelete(null);
    }
  };

  const handleShare = (document) => {
    // In a real implementation, this would open a sharing modal.
    console.log(`Share action for: ${document.name} (${document.id})`);
  };

  const HeaderContent = memo(() => {
    if (selectedDocumentsLength > 0 || selectedFoldersLength > 0) {
      const totalItems = (documents?.length || 0) + (folders?.length || 0);
      const isAllSelected = totalItems === totalSelectedItem;

      const handleSelectAll = () => {
        if (isAllSelected) {
          setSelectedDocuments([]);
          setSelectedFolders([]);
        } else {
          const allDocumentIds = documents?.map((doc) => doc.id) || [];
          const allFolderIds = folders?.map((folder) => folder.id) || [];
          setSelectedDocuments(allDocumentIds);
          setSelectedFolders(allFolderIds);
        }
      };

      return (
        <div className="mb-2 flex items-center gap-x-1 rounded-3xl bg-gray-100 p-1 text-sm text-foreground dark:bg-gray-800">
          <Checkbox
            id="select-all"
            checked={isAllSelected}
            onCheckedChange={handleSelectAll}
            className="ml-2 h-5 w-5"
            aria-label="Select all"
          />
          <Button
            onClick={resetSelection}
            variant="ghost"
            size="sm"
          >
            Clear
          </Button>

          {selectedDocumentsLength ? (
            <div className="mr-2 tabular-nums">
              {selectedDocumentsLength} document{selectedDocumentsLength > 1 ? "s" : ""} selected
            </div>
          ) : null}
          {selectedFoldersLength ? (
            <div className="mr-2 tabular-nums">
              {selectedFoldersLength} folder{selectedFoldersLength > 1 ? "s" : ""} selected
            </div>
          ) : null}
        </div>
      );
    } else {
      return (
        <div className="mb-2 flex items-center gap-x-2 pt-5">
          {folders && folders.length > 0 && (
            <p className="flex items-center gap-x-1 text-sm text-gray-400">
              <FolderIcon className="h-5 w-5" />
              <span>
                {folders.length} folder{folders.length > 1 ? "s" : ""}
              </span>
            </p>
          )}
          {documents && documents.length > 0 && (
            <p className="flex items-center gap-x-1 text-sm text-gray-400">
              <FileIcon className="h-5 w-5" />
              <span>
                {documents.length} document{documents.length > 1 ? "s" : ""}
              </span>
            </p>
          )}
        </div>
      );
    }
  });
  HeaderContent.displayName = "HeaderContent";

  const documentsHeaderPortal = document.getElementById("documents-header-count");

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
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div {...getRootProps({ className: "space-y-4 relative" })}>
          <input {...getInputProps()} />
          {isDragActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10">
              <p className="text-lg font-semibold text-primary">
                Drop files or folders to upload
              </p>
            </div>
          )}
          {/* Folders list */}
          <ul role="list" className="space-y-4">
            {folders && !foldersLoading
              ? folders.map((folder) => (
                <li key={folder.id}>
                  <DroppableFolder
                    key={folder.id}
                    id={folder.id}
                    disabledFolder={selectedFolders}
                    path={folder.path}
                  >
                    <DraggableItem
                      key={folder.id}
                      id={folder.id}
                      isSelected={selectedFolders.includes(folder.id)}
                      onSelect={handleSelect}
                      isDraggingSelected={isDragging}
                      type="folder"
                    >
                      <FolderCard
                        folder={folder}
                        onRename={handleRename}
                        onDelete={(item) => handleDelete(item, "folder")}
                      />
                    </DraggableItem>
                  </DroppableFolder>
                </li>
              ))
              : Array.from({ length: 2 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-20 w-full" />
                </li>
              ))}
          </ul>

          {/* Documents list */}
          <ul role="list" className="space-y-4">
            {documents && !loading
              ? documents.map((document) => (
                <li key={document.id}>
                  <DraggableItem
                    key={document.id}
                    id={document.id}
                    isSelected={selectedDocuments.includes(document.id)}
                    isDraggingSelected={isDragging}
                    type="document"
                    onSelect={handleSelect}
                  >
                    <DocumentCard
                      document={document}
                      onRename={handleRename}
                      onDelete={(item) => handleDelete(item, "document")}
                      onShare={handleShare}
                    />
                  </DraggableItem>
                </li>
              ))
              : Array.from({ length: 3 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-20 w-full" />
                </li>
              ))}
          </ul>

          {createPortal(<DragOverlay>
            <div className="relative">
              {draggedDocument && <DocumentCard document={draggedDocument} />}
              {draggedFolder && <FolderCard folder={draggedFolder} />}
              {totalSelectedItem > 1 && (
                <div className="absolute -right-4 -top-4 rounded-full border bg-foreground px-4 py-2">
                  <span className="text-sm font-semibold text-background">
                    {totalSelectedItem}
                  </span>
                </div>
              )}
            </div>
          </DragOverlay>, document.body)}

          {documentsHeaderPortal && createPortal(<HeaderContent />, documentsHeaderPortal)}

          {!loading && !foldersLoading && documents.length === 0 && folders.length === 0 && (
            <div className="flex items-center justify-center">
              <EmptyDocuments />
            </div>
          )}
        </div>
      </DndContext>
    </>
  );
}
