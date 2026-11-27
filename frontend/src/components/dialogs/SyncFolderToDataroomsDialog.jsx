import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertCircle, Folder as FolderIcon, Loader2, RefreshCw } from 'lucide-react';
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
import { syncFolderToDatarooms } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatters';
import { getLocalizedErrorMessage } from '../../utils/errorTranslator';

export function SyncFolderToDataroomsDialog({
  isOpen,
  onOpenChange,
  folder,
  onSuccess,
}) {
  const { t } = useTranslation();
  const targets = folder?.synced_datarooms || [];
  const folderId = folder?.id;
  const folderRef = useRef(folder);
  folderRef.current = folder;
  const activeSessionIdRef = useRef(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    activeSessionIdRef.current += 1;
    setIsSyncing(false);
    if (isOpen && folderId) {
      const currentTargets = folderRef.current?.synced_datarooms || [];
      setSelectedIds(currentTargets.map((ref) => ref.dataroom_folder_id));
      setErrorMessage('');
    } else if (!isOpen) {
      setErrorMessage('');
    }
  }, [isOpen, folderId]);

  const formatFailedResults = (results) =>
    results
      .filter((item) => item.status === 'error')
      .map((item) =>
        t('documents.syncPartialDetail', {
          name: item.dataroom_name,
          detail: getLocalizedErrorMessage(item.detail, 'common.errorOccurred'),
        })
      )
      .join(' ');

  const toggleTarget = (dataroomFolderId) => {
    setSelectedIds((prev) =>
      prev.includes(dataroomFolderId)
        ? prev.filter((id) => id !== dataroomFolderId)
        : [...prev, dataroomFolderId]
    );
  };

  const allSelected = targets.length > 0 && selectedIds.length === targets.length;

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(targets.map((ref) => ref.dataroom_folder_id));
    }
  };

  const handleConfirm = async () => {
    if (!folder || selectedIds.length === 0 || isSyncing) {
      return;
    }
    const sessionId = activeSessionIdRef.current;
    const isCurrentSession = () => sessionId === activeSessionIdRef.current;

    setIsSyncing(true);
    setErrorMessage('');
    try {
      const response = await syncFolderToDatarooms(folder.id, {
        dataroom_folder_ids: selectedIds,
      });
      const {
        synced_count: syncedCount = 0,
        failed_count: failedCount = 0,
        results = [],
      } = response?.data || {};

      if (failedCount > 0) {
        if (isCurrentSession()) {
          setErrorMessage(formatFailedResults(results));
        }
        if (syncedCount > 0) {
          toast.warning(
            t('documents.syncPartialFailure', {
              synced: syncedCount,
              failed: failedCount,
            })
          );
          onSuccess?.();
        }
        return;
      }

      toast.success(t('documents.syncSuccessCount', { count: syncedCount }));
      onSuccess?.();
      if (isCurrentSession()) {
        onOpenChange(false);
      }
    } catch (error) {
      if (!isCurrentSession()) {
        return;
      }
      const responseResults = error?.response?.data?.results;
      if (Array.isArray(responseResults)) {
        const formatted = formatFailedResults(responseResults);
        if (formatted) {
          setErrorMessage(formatted);
          return;
        }
      }
      setErrorMessage(getLocalizedErrorMessage(error, 'common.errorOccurred'));
    } finally {
      if (isCurrentSession()) {
        setIsSyncing(false);
      }
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isSyncing) {
          onOpenChange(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0 sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-zinc-100">
            <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t('documents.syncFolderTitle', { name: folder?.name || '' })}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t('documents.syncFolderDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 flex-1 overflow-y-auto space-y-3">
          {targets.length > 1 && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleToggleAll}
                disabled={isSyncing}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
              >
                {allSelected ? t('documents.syncDeselectAll') : t('documents.syncSelectAll')}
              </button>
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-800">
            {targets.map((target) => {
              const isChecked = selectedIds.includes(target.dataroom_folder_id);
              const labelText = `${target.dataroom_name} (${target.dataroom_folder_path})`;
              return (
                <label
                  key={target.dataroom_folder_id}
                  htmlFor={`sync-target-${target.dataroom_folder_id}`}
                  className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <Checkbox
                    id={`sync-target-${target.dataroom_folder_id}`}
                    checked={isChecked}
                    onCheckedChange={() => toggleTarget(target.dataroom_folder_id)}
                    disabled={isSyncing}
                    aria-label={labelText}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FolderIcon className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-zinc-100">
                        {target.dataroom_name}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      {target.dataroom_folder_path}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      {target.last_synced_at
                        ? t('documents.lastSyncedAt', { time: formatRelativeTime(target.last_synced_at) })
                        : t('documents.neverSynced')}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <p className="rounded-md bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 text-xs text-slate-600 dark:text-zinc-300">
            {t('documents.syncFolderNotice')}
          </p>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 bg-slate-50/70 dark:bg-zinc-800/40 border-t border-slate-100 dark:border-zinc-800/80 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!isSyncing) {
                onOpenChange(false);
              }
            }}
            disabled={isSyncing}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={isSyncing || selectedIds.length === 0}
            className="inline-flex items-center gap-1.5"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t('documents.syncing')}</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{t('documents.syncNow')}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
