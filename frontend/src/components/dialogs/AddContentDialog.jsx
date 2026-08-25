import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { getFolderContents, getRootFolderContents } from '../../services/api';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Checkbox } from '../ui/Checkbox';
import { FileTypeIcon } from '../documents/FileTypeIcon';

function Breadcrumbs({ path, onNavigate }) {
  const { t } = useTranslation();
  return (
    <nav className="flex items-center text-sm" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        <li>
          <button
            onClick={() => onNavigate(null)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('datarooms.allFiles')}
          </button>
        </li>
        {path.map((folder, index) => (
          <li key={folder.id}>
            <div className="flex items-center">
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <button
                onClick={() => onNavigate(folder.id)}
                className={`ml-2 ${
                  index === path.length - 1
                    ? 'font-semibold text-gray-800 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                aria-current={index === path.length - 1 ? 'page' : undefined}
              >
                {folder.name}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AddContentDialog({ isOpen, onOpenChange, onConfirm }) {
  const { t } = useTranslation();
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState({ documents: [], folders: [] });
  const [isConfirming, setIsConfirming] = useState(false);

  const fetchData = useCallback(async (folderId = null) => {
    setLoading(true);
    try {
      const response = folderId
        ? await getFolderContents(folderId)
        : await getRootFolderContents();
      const { current_folder, sub_folders, documents } = response.data;
      setCurrentFolder(current_folder);
      setFolders(sub_folders);
      setDocuments(documents);
    } catch (error) {
      // Toast is handled by api interceptor
      console.error('Failed to fetch content:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData(null);
      // Reset selection when dialog opens
      setSelection({ documents: [], folders: [] });
    }
  }, [isOpen, fetchData]);

  const handleNavigate = (folderId) => {
    fetchData(folderId);
  };

  const handleItemSelect = (id, type) => {
    setSelection((prev) => {
      const newSelection = { ...prev };
      const list = newSelection[type];
      if (list.includes(id)) {
        newSelection[type] = list.filter((itemId) => itemId !== id);
      } else {
        newSelection[type] = [...list, id];
      }
      return newSelection;
    });
  };

  const handleConfirm = async () => {
    if (selection.documents.length === 0 && selection.folders.length === 0) {
      toast.info('Please select at least one item to add.');
      return;
    }
    setIsConfirming(true);
    try {
      await onConfirm({
        document_ids: selection.documents,
        folder_ids: selection.folders,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const breadcrumbPath = currentFolder ? [...currentFolder.ancestors, currentFolder] : [];
  const selectedCount = selection.documents.length + selection.folders.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isConfirming) {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="sm:max-w-2xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('datarooms.addContentTitle')}</DialogTitle>
          <DialogDescription>
            {t('datarooms.addContentDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="border-t border-b border-gray-200 dark:border-gray-700 py-2 px-4">
          <Breadcrumbs path={breadcrumbPath} onNavigate={handleNavigate} />
        </div>

        <div className="flex-grow overflow-y-auto pr-2">
          {loading ? (
            <p className="text-center py-8">{t('qna.loading')}</p>
          ) : (
            <ul className="space-y-1">
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-3 flex-grow">
                    <Checkbox
                      id={`folder-${folder.id}`}
                      checked={selection.folders.includes(folder.id)}
                      onCheckedChange={() => handleItemSelect(folder.id, 'folders')}
                    />
                    <button
                      onClick={() => handleNavigate(folder.id)}
                      className="flex items-center gap-3 text-left w-full"
                    >
                      <FileTypeIcon type="folder" className="h-5 w-5 shrink-0" />
                      <span className="flex-grow">{folder.name}</span>
                    </button>
                  </div>
                </li>
              ))}
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-3 flex-grow">
                     <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selection.documents.includes(doc.id)}
                      onCheckedChange={() => handleItemSelect(doc.id, 'documents')}
                    />
                    <FileTypeIcon type={doc.type} className="h-5 w-5 shrink-0" />
                    <span className="flex-grow">{doc.name}</span>
                  </div>
                </li>
              ))}
              {folders.length === 0 && documents.length === 0 && (
                <p className="text-center text-gray-500 py-8">{t('datarooms.folderEmpty')}</p>
              )}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!isConfirming) {
                onOpenChange(false);
              }
            }}
            disabled={isConfirming}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirming || selectedCount === 0}>
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('datarooms.addSelectedItems', { count: selectedCount })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
