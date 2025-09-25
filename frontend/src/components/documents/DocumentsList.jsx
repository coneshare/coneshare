import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, } from "@dnd-kit/core";
import { FileIcon, FolderIcon, } from "lucide-react";
import { memo, useCallback, useMemo, useState, useEffect } from "react";
import * as React from 'react';
import { createPortal } from "react-dom";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { deleteDocument, deleteFolder } from "../../services/api";
import { ConfirmationDialog } from "../dialogs/ConfirmationDialog";
import { RenameItemDialog } from "../dialogs/RenameItemDialog";

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
  selectedDocuments,
  selectedFolders,
  onItemSelect,
  onClearSelection,
}) {
  const [itemToDelete, setItemToDelete] = useState(null);
  const [itemToRename, setItemToRename] = useState(null);

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

  const handleSelect = useCallback((id, type, event) => {
    onItemSelect(id, type, event);
  }, [onItemSelect]);

  const handleDragStart = useCallback(
    (event) => {
      setIsDragging(true);
      const { type } = event.active.data.current ?? {};
      const itemId = event.active.id;

      if (type === "document") {
        const draggedItem = documents.find((item) => item.id === itemId) ?? null;
        setDraggedDocument(draggedItem);
        if (!selectedDocuments.includes(itemId)) {
          onItemSelect(itemId, type);
        }
      }

      if (type === "folder") {
        const draggedItem = folders.find((item) => item.id === itemId) ?? null;
        setDraggedFolder(draggedItem);
        if (!selectedFolders.includes(itemId)) {
          onItemSelect(itemId, type);
        }
      }
    },
    [documents, folders, selectedDocuments, selectedFolders, onItemSelect]
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

    onClearSelection();
  };

  const resetSelection = () => {
    onClearSelection();
  };

  const handleRename = (item, type) => {
    setItemToRename({ ...item, type });
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
                      type="folder"
                    >
                      <FolderCard
                        folder={folder}
                        onRename={() => handleRename(folder, "folder")}
                        onDelete={() => handleDelete(folder, "folder")}
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
                    type="document"
                    onSelect={handleSelect}
                  >
                    <DocumentCard
                      document={document}
                      onRename={() => handleRename(document, "document")}
                      onDelete={() => handleDelete(document, "document")}
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
