import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { Checkbox } from '../ui/Checkbox';
import { FileTypeIcon, getDocumentBadgeStyle } from '../documents/FileTypeIcon';
import { formatBytes } from '../../lib/formatters';
import { formatRelativeTime } from '../../utils/formatters';
import { getFolderContents, getRootFolderContents } from '../../services/api';
import {
  ChevronRight,
  Folder as FolderIcon,
  Home,
  Search,
  RotateCw,
  AlertCircle,
  ArrowRight,
  Loader2,
} from 'lucide-react';

function Breadcrumbs({ path, onNavigate }) {
  const { t } = useTranslation();

  return (
    <nav className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-zinc-400 font-medium min-w-0" aria-label="Breadcrumb">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="hover:text-slate-900 dark:hover:text-zinc-100 flex items-center space-x-1 transition-colors shrink-0"
      >
        <Home className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
        <span>{t('datarooms.home')}</span>
      </button>
      {path.map((folder, index) => {
        const isCurrent = index === path.length - 1;
        return (
          <div key={folder.id} className="flex items-center space-x-1.5 min-w-0">
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
            {isCurrent ? (
              <span
                className="truncate max-w-[120px] sm:max-w-[160px] font-semibold text-slate-800 dark:text-zinc-100"
                aria-current="page"
                title={folder.name}
              >
                {folder.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(folder.id)}
                className="truncate max-w-[120px] sm:max-w-[160px] text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                title={folder.name}
              >
                {folder.name}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function AddContentDialog({ isOpen, onOpenChange, onConfirm }) {
  const { t } = useTranslation();
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selection, setSelection] = useState({ documents: [], folders: [] });
  const [isConfirming, setIsConfirming] = useState(false);
  const requestIdRef = useRef(0);
  const lastRequestedFolderIdRef = useRef(null);

  const fetchData = useCallback(async (folderId = null) => {
    lastRequestedFolderIdRef.current = folderId;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFetchError(false);
    try {
      const response = folderId
        ? await getFolderContents(folderId)
        : await getRootFolderContents();

      if (requestId !== requestIdRef.current) return;

      const { current_folder, sub_folders, documents } = response?.data || {};
      setCurrentFolder(current_folder || null);
      setFolders(sub_folders || []);
      setDocuments(documents || []);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        console.error('Failed to fetch content:', error);
        setFetchError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelection({ documents: [], folders: [] });
      fetchData(null);
    }
  }, [isOpen, fetchData]);

  const handleNavigate = (folderId) => {
    const targetId = folderId ?? null;
    const activeTargetId = lastRequestedFolderIdRef.current ?? null;
    if (targetId === activeTargetId && !fetchError) {
      return;
    }
    setSearchQuery('');
    setSelection({ documents: [], folders: [] });
    fetchData(folderId);
  };

  const handleItemSelect = (id, type) => {
    setSelection((prev) => {
      const list = prev[type] || [];
      const updated = list.includes(id)
        ? list.filter((itemId) => itemId !== id)
        : [...list, id];
      return { ...prev, [type]: updated };
    });
  };

  const handleClearSelection = () => {
    setSelection({ documents: [], folders: [] });
  };

  const handleConfirm = async () => {
    if (selection.documents.length === 0 && selection.folders.length === 0) {
      return;
    }
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      await onConfirm({
        document_ids: selection.documents,
        folder_ids: selection.folders,
      });
    } catch (error) {
      console.error('Failed to add content to dataroom:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const filteredFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, searchQuery]);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, searchQuery]);

  const breadcrumbPath = currentFolder ? [...(currentFolder.ancestors || []), currentFolder] : [];
  const selectedCount = selection.documents.length + selection.folders.length;
  const hasItems = folders.length > 0 || documents.length > 0;
  const hasFilteredItems = filteredFolders.length > 0 || filteredDocuments.length > 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isConfirming) {
          onOpenChange(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0 sm:text-left">
          <div className="flex items-center space-x-2">
            <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-zinc-100 tracking-tight flex items-center space-x-2">
              <span>{t('datarooms.addContentTitle')}</span>
              {selectedCount > 0 && (
                <span className="text-xs font-medium bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300 py-0.5 px-2 rounded-full border border-slate-200 dark:border-zinc-700">
                  {t('documents.selectedCount', { count: selectedCount })}
                </span>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t('datarooms.addContentDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Filter and Search Toolbar */}
        <div className="px-6 py-2.5 bg-slate-50/70 dark:bg-zinc-800/40 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 text-sm shrink-0">
          <Breadcrumbs path={breadcrumbPath} onNavigate={handleNavigate} />
          <div className="flex items-center space-x-2 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('datarooms.filterCurrentList')}
                className="w-36 sm:w-44 pl-7 pr-2.5 py-1 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-slate-400 dark:focus:ring-zinc-500 shadow-xs"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-2 top-2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Content File & Folder List */}
        <div className="px-4 py-2 flex-1 min-h-[220px] max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60">
          {loading ? (
            <div className="p-3 space-y-2">
              <p className="sr-only">{t('documents.loadingFolders')}</p>
              <div className="h-10 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-10 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-10 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
            </div>
          ) : fetchError ? (
            <div className="flex flex-col h-full items-center justify-center p-8 text-center text-sm text-slate-400 dark:text-zinc-500 gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400" />
              <span>{t('common.errorOccurred')}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchData(lastRequestedFolderIdRef.current)}
                className="mt-1 text-xs inline-flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{t('common.retry')}</span>
              </Button>
            </div>
          ) : !hasItems ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-slate-400 dark:text-zinc-500">
              {t('datarooms.folderEmpty')}
            </div>
          ) : !hasFilteredItems ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-slate-400 dark:text-zinc-500">
              {t('viewer.noMatchingFiles')}
            </div>
          ) : (
            <div className="space-y-1">
              {/* Folder Rows */}
              {filteredFolders.map((folder) => {
                const isChecked = selection.folders.includes(folder.id);
                const itemCount = folder.items_count ?? (Array.isArray(folder.items) ? folder.items.length : null);

                return (
                  <div
                    key={folder.id}
                    onClick={(e) => {
                      if (e.target.closest('button') || e.target.closest('[role="checkbox"]')) return;
                      handleItemSelect(folder.id, 'folders');
                    }}
                    onDoubleClick={() => handleNavigate(folder.id)}
                    className={`group flex items-center justify-between py-2 px-2 rounded-lg transition-colors cursor-pointer select-none ${
                      isChecked
                        ? 'bg-slate-50/90 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700'
                        : 'hover:bg-slate-50 dark:hover:bg-zinc-800/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <Checkbox
                        id={`folder-${folder.id}`}
                        checked={isChecked}
                        onCheckedChange={() => handleItemSelect(folder.id, 'folders')}
                        aria-label={folder.name}
                      />
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 flex items-center justify-center shrink-0">
                        <FolderIcon className="w-4 h-4" strokeWidth={2} />
                      </div>
                      <div className="truncate flex-1">
                        <p className={`text-sm truncate ${isChecked ? 'font-semibold text-slate-900 dark:text-zinc-100' : 'font-medium text-slate-800 dark:text-zinc-200 group-hover:text-slate-900 dark:group-hover:text-zinc-100'}`}>
                          {folder.name}
                        </p>
                        {itemCount !== null && (
                          <p className="text-xs text-slate-400 dark:text-zinc-500 font-normal">
                            {t('documents.itemCount', { count: itemCount })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 ml-4">
                      {folder.updated_at && (
                        <span className="text-xs text-slate-400 dark:text-zinc-500 font-normal hidden sm:inline">
                          {formatRelativeTime(folder.updated_at)}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigate(folder.id);
                        }}
                        className="h-7 w-7 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                        title={t('datarooms.openFolder', { name: folder.name })}
                        aria-label={t('datarooms.openFolder', { name: folder.name })}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Document Rows */}
              {filteredDocuments.map((doc) => {
                const isChecked = selection.documents.includes(doc.id);
                const docType = doc.type || doc.name;

                return (
                  <div
                    key={doc.id}
                    onClick={(e) => {
                      if (e.target.closest('[role="checkbox"]')) return;
                      handleItemSelect(doc.id, 'documents');
                    }}
                    className={`group flex items-center justify-between py-2 px-2 rounded-lg transition-colors cursor-pointer select-none ${
                      isChecked
                        ? 'bg-slate-50/90 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700'
                        : 'hover:bg-slate-50 dark:hover:bg-zinc-800/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <Checkbox
                        id={`doc-${doc.id}`}
                        checked={isChecked}
                        onCheckedChange={() => handleItemSelect(doc.id, 'documents')}
                        aria-label={doc.name}
                      />
                      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${getDocumentBadgeStyle(docType)}`}>
                        <FileTypeIcon type={docType} className="h-4 w-4 shrink-0" palette="viewer" />
                      </div>
                      <div className="truncate flex-1">
                        <p className={`text-sm truncate ${isChecked ? 'font-semibold text-slate-900 dark:text-zinc-100' : 'font-medium text-slate-800 dark:text-zinc-200 group-hover:text-slate-900 dark:group-hover:text-zinc-100'}`}>
                          {doc.name}
                        </p>
                        {typeof doc.file_size === 'number' && (
                          <p className="text-xs text-slate-400 dark:text-zinc-500 font-normal">
                            {formatBytes(doc.file_size)}
                          </p>
                        )}
                      </div>
                    </div>
                    {doc.updated_at && (
                      <span className="text-xs text-slate-400 dark:text-zinc-500 shrink-0 ml-4 font-normal hidden sm:inline">
                        {formatRelativeTime(doc.updated_at)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 bg-slate-50/70 dark:bg-zinc-800/40 border-t border-slate-100 dark:border-zinc-800/80 flex flex-row items-center justify-between sm:justify-between sm:space-x-0 shrink-0">
          <div className="flex items-center space-x-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline transition-colors"
              >
                {t('documents.clearSelection')}
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!isConfirming) {
                  onOpenChange(false);
                }
              }}
              disabled={isConfirming}
              className="text-xs"
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isConfirming || selectedCount === 0}
              className="inline-flex items-center gap-1.5 text-xs font-medium"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('common.saving')}</span>
                </>
              ) : (
                <>
                  <span>{t('datarooms.addSelectedItems', { count: selectedCount })}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
