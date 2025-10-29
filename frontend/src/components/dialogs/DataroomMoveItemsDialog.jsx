import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { getDataroom, getDataroomFolderContents } from '../../services/api';
import { Folder as FolderIcon, ChevronRight } from 'lucide-react';

function Breadcrumbs({ path, onNavigate }) {
  const handleNavigate = (folderId, isRoot = false) => {
    if (isRoot) {
      onNavigate(null);
    } else {
      onNavigate(folderId);
    }
  };

  return (
    <nav className="flex items-center text-sm" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        <li>
          <button
            onClick={() => handleNavigate(null, true)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Dataroom Root
          </button>
        </li>
        {/* Placeholder for ancestors - requires backend support */}
      </ol>
    </nav>
  );
}

export function DataroomMoveItemsDialog({ isOpen, onOpenChange, onConfirm, dataroomId, selectedFolderIds = [] }) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  const fetchData = useCallback(async (folderId) => {
    setLoading(true);
    try {
      const response = folderId
        ? await getDataroomFolderContents(folderId)
        : await getDataroom(dataroomId);
      
      const subFolders = response.data.sub_folders || response.data.folders || [];
      setFolders(subFolders);
    } catch (error) {
      console.error('Failed to fetch dataroom content:', error);
    } finally {
      setLoading(false);
    }
  }, [dataroomId]);

  useEffect(() => {
    if (isOpen) {
      fetchData(null);
    }
  }, [isOpen, fetchData]);

  const handleNavigate = (folderId) => {
    setCurrentFolderId(folderId);
    fetchData(folderId);
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    await onConfirm(currentFolderId);
    setIsConfirming(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[60vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Move Items</DialogTitle>
          <DialogDescription>
            Select a destination folder to move the selected items.
          </DialogDescription>
        </DialogHeader>

        <div className="border-t border-b border-gray-200 dark:border-gray-700 py-2 px-4">
          <Breadcrumbs path={[]} onNavigate={handleNavigate} />
        </div>

        <div className="flex-grow overflow-y-auto pr-2">
          {loading ? (
            <p className="text-center py-8">Loading folders...</p>
          ) : (
            <ul className="space-y-1">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    onClick={() => handleNavigate(folder.id)}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
                    disabled={selectedFolderIds.includes(folder.id)}
                  >
                    <FolderIcon className="h-5 w-5 text-gray-500" />
                    <span>{folder.name}</span>
                  </button>
                </li>
              ))}
              {folders.length === 0 && (
                <p className="text-center text-gray-500 py-8">No subfolders.</p>
              )}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? 'Moving...' : 'Move Here'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
