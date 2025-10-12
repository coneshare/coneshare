import { useState, useEffect, useCallback } from 'react';
import { Folder as FolderIcon, ChevronRight, Home, ArrowLeft, FolderPlusIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { createFolder, getFolderContents, getRootFolderContents } from '../../services/api';
import { Skeleton } from '../ui/Skeleton';
import { AddFolderDialog } from './AddFolderDialog';

export function MoveItemsDialog({ isOpen, onOpenChange, onConfirm, selectedFolderIds = [] }) {
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false);

  const fetchFolders = useCallback(async (folderId) => {
    setLoading(true);
    try {
      const response = folderId
        ? await getFolderContents(folderId)
        : await getRootFolderContents();
      const { current_folder, sub_folders } = response.data;
      setCurrentFolder(current_folder);
      setFolders(sub_folders);
    } catch (error) {
      // API interceptor will show a toast
      console.error("Failed to fetch folders for move dialog:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchFolders(null); // Start at root
    }
  }, [isOpen, fetchFolders]);

  const handleFolderClick = (folderId) => {
    fetchFolders(folderId);
  };

  const handleBackClick = () => {
    if (currentFolder && currentFolder.ancestors && currentFolder.ancestors.length > 0) {
        const parentId = currentFolder.ancestors[currentFolder.ancestors.length - 1].id;
        fetchFolders(parentId);
    } else {
        fetchFolders(null); // Go to root
    }
  };

  const handleMoveHere = () => {
    onConfirm(currentFolder?.id || null);
  };

  const handleCreateFolder = async (name) => {
    try {
      // Create the folder in the currently viewed directory
      await createFolder(name, currentFolder?.id || null);
      // Refresh the folder list to show the new folder
      await fetchFolders(currentFolder?.id || null);
    } catch (error) {
      // API interceptor will show toast on error, but we log just in case.
      console.error("Failed to create folder:", error);
    } finally {
      setIsAddFolderOpen(false);
    }
  };

  const renderBreadcrumbs = () => (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-muted-foreground">
      <button
        onClick={() => fetchFolders(null)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        <Home className="h-4 w-4" />
        <span>Root</span>
      </button>
      {currentFolder?.ancestors?.map(ancestor => (
        <div key={ancestor.id} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
          <button
            onClick={() => fetchFolders(ancestor.id)}
            className="truncate hover:text-foreground"
          >
            {ancestor.name}
          </button>
        </div>
      ))}
      {currentFolder && (
        <div className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
          <span className="font-semibold text-foreground">{currentFolder.name}</span>
        </div>
      )}
    </nav>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <AddFolderDialog
        isOpen={isAddFolderOpen}
        onOpenChange={setIsAddFolderOpen}
        onConfirm={handleCreateFolder}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move Items</DialogTitle>
          <DialogDescription>
            Select a destination folder.
          </DialogDescription>
        </DialogHeader>
        
        <div className="my-2 space-y-2">
          {currentFolder && (
            <Button variant="ghost" size="sm" onClick={handleBackClick} className="flex items-center gap-2 text-sm">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
          <div className="rounded-md border bg-muted/50 p-2">
            {renderBreadcrumbs()}
          </div>
        </div>

        <div className="h-64 overflow-y-auto rounded-md border p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : folders.length > 0 ? (
            folders.map(folder => {
              const isDisabled = selectedFolderIds.includes(folder.id);
              return (
                <button
                  key={folder.id}
                  onClick={() => handleFolderClick(folder.id)}
                  disabled={isDisabled}
                  className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FolderIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{folder.name}</span>
                </button>
              );
            })
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No subfolders</p>
          )}
        </div>
        
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => setIsAddFolderOpen(true)}>
            <FolderPlusIcon className="mr-2 h-4 w-4" />
            New Folder
          </Button>
          <div className="flex gap-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleMoveHere}>
              Move Here
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
