import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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

function Breadcrumbs({ currentFolder, onNavigate }) {
  const { t } = useTranslation();

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-muted-foreground min-w-0" aria-label="Breadcrumb">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className={`hover:text-foreground flex-shrink-0 ${!currentFolder ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
      >
        {t('datarooms.dataroomRoot')}
      </button>
      {currentFolder?.ancestors?.map((ancestor) => (
        <div key={ancestor.id} className="flex items-center gap-1 min-w-0">
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => onNavigate(ancestor.id)}
            className="truncate max-w-[140px] sm:max-w-[180px] hover:text-foreground text-muted-foreground"
            title={ancestor.name}
          >
            {ancestor.name}
          </button>
        </div>
      ))}
      {currentFolder && (
        <div className="flex items-center gap-1 min-w-0">
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span
            className="font-semibold text-foreground truncate max-w-[180px] sm:max-w-[240px]"
            title={currentFolder.name}
          >
            {currentFolder.name}
          </span>
        </div>
      )}
    </nav>
  );
}

export function DataroomMoveItemsDialog({ isOpen, onOpenChange, onConfirm, dataroomId, selectedFolderIds = [] }) {
  const { t } = useTranslation();
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [currentFolderInfo, setCurrentFolderInfo] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (folderId) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const response = folderId
        ? await getDataroomFolderContents(folderId)
        : await getDataroom(dataroomId);
      
      // Ignore stale responses from earlier navigation requests
      if (requestId !== requestIdRef.current) return;

      // Update breadcrumb navigation metadata:
      // When at root, currentFolderInfo is null; inside a subfolder, track name and ancestors.
      if (folderId) {
        setCurrentFolderInfo({
          id: response.data.id,
          name: response.data.name,
          ancestors: response.data.ancestors || [],
        });
      } else {
        setCurrentFolderInfo(null);
      }

      // API Schema Note:
      // - getDataroom (root) returns an `items` array with { type: 'folder' | 'document' }.
      // - getDataroomFolderContents (subfolder) returns `sub_folders` and `items`.
      // We check sub_folders first, then filter `items` for folder types to ensure folders
      // at both root level and subfolder levels are correctly listed.
      const subFolders = response.data.sub_folders
        || (response.data.items ? response.data.items.filter((item) => item.type === 'folder') : [])
        || [];
      setFolders(subFolders);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        console.error('Failed to fetch dataroom content:', error);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [dataroomId]);

  useEffect(() => {
    if (isOpen) {
      setCurrentFolderId(null);
      setCurrentFolderInfo(null);
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
          <DialogTitle>{t('documents.moveTitle')}</DialogTitle>
          <DialogDescription>
            {t('datarooms.moveItemsDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="border-t border-b border-gray-200 dark:border-gray-700 py-2 px-4">
          <Breadcrumbs currentFolder={currentFolderInfo} onNavigate={handleNavigate} />
        </div>

        <div className="flex-grow overflow-y-auto pr-2 min-w-0">
          {loading ? (
            <p className="text-center py-8">{t('documents.loadingFolders')}</p>
          ) : (
            <ul className="space-y-1 min-w-0">
              {folders.map((folder) => (
                <li key={folder.id} className="min-w-0">
                  <button
                    onClick={() => handleNavigate(folder.id)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-md p-2 text-left hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
                    disabled={selectedFolderIds.includes(folder.id)}
                    title={folder.name}
                  >
                    <FolderIcon className="h-5 w-5 flex-shrink-0 text-gray-500" />
                    <span className="truncate min-w-0 flex-1">{folder.name}</span>
                  </button>
                </li>
              ))}
              {folders.length === 0 && (
                <p className="text-center text-gray-500 py-8">{t('documents.noSubfolders')}</p>
              )}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? t('common.moving') : t('documents.moveHere')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
