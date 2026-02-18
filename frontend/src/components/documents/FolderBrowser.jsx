import { useState, useEffect, useCallback } from 'react';
import { Folder as FolderIcon, ChevronRight, Home, ArrowLeft } from 'lucide-react';
import { getFolderContents, getRootFolderContents } from '../../services/api';
import { Skeleton } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { ROOT_FOLDER_NAME } from '../../lib/constants';

export function FolderBrowser({ onCurrentFolderChange, initialFolderId = null, disabledFolderIds = [] }) {
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFolders = useCallback(async (folderId) => {
    setLoading(true);
    try {
      const response = folderId
        ? await getFolderContents(folderId)
        : await getRootFolderContents();
      const { current_folder, sub_folders } = response.data;
      setCurrentFolder(current_folder);
      setFolders(sub_folders);
      if (onCurrentFolderChange) {
        onCurrentFolderChange(current_folder);
      }
    } catch (error) {
      console.error("Failed to fetch folders:", error);
      // Let consuming components show a toast if they want to.
    } finally {
      setLoading(false);
    }
  }, [onCurrentFolderChange]);

  useEffect(() => {
    fetchFolders(initialFolderId);
  }, [initialFolderId, fetchFolders]);

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

  const renderBreadcrumbs = () => (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-muted-foreground">
      <button
        type="button"
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
            type="button"
            onClick={() => fetchFolders(ancestor.id)}
            className="truncate hover:text-foreground"
          >
            {ancestor.name}
          </button>
        </div>
      ))}
      {currentFolder && currentFolder.name !== ROOT_FOLDER_NAME && (
        <div className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
          <span className="font-semibold text-foreground">{currentFolder.name}</span>
        </div>
      )}
    </nav>
  );

  return (
    <div className="space-y-2">
      {currentFolder && (
        <Button variant="ghost" size="sm" type="button" onClick={handleBackClick} className="flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      )}
      <div className="rounded-md border bg-muted/50 p-2">
        {renderBreadcrumbs()}
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
            const isDisabled = disabledFolderIds.includes(folder.id);
            return (
              <button
                key={folder.id}
                type="button"
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
    </div>
  );
}
