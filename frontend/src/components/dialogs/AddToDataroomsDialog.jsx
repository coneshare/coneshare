import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  FolderPlus,
  Loader2,
  RotateCw,
  Search,
} from 'lucide-react';
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
import { addContentToDataroom, getDatarooms } from '../../services/api';
import { getLocalizedErrorMessage } from '../../utils/errorTranslator';

/**
 * Aggregate existing synced dataroom references keyed by dataroom_id,
 * counting distinct selected folder IDs rather than raw synced path entries.
 */
function buildSyncInfoByDataroomId(folders) {
  const map = new Map();
  for (const folder of folders || []) {
    const refs = Array.isArray(folder?.synced_datarooms) ? folder.synced_datarooms : [];
    for (const ref of refs) {
      if (!ref?.dataroom_id) continue;
      const key = String(ref.dataroom_id);
      let entry = map.get(key);
      if (!entry) {
        entry = { folderIds: new Set(), paths: new Set() };
        map.set(key, entry);
      }
      entry.folderIds.add(String(folder.id));
      if (ref.dataroom_folder_path) {
        entry.paths.add(ref.dataroom_folder_path);
      }
    }
  }
  return map;
}

export function AddToDataroomsDialog({
  isOpen,
  onOpenChange,
  items,
  onSuccess,
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const targetFolders = useMemo(() => items?.folders || [], [items?.folders]);
  const targetDocuments = useMemo(() => items?.documents || [], [items?.documents]);
  const hasFolders = targetFolders.length > 0;
  const hasDocuments = targetDocuments.length > 0;
  const totalItemCount = targetFolders.length + targetDocuments.length;

  const targetSignature = useMemo(() => {
    const folderPart = targetFolders.map((f) => String(f.id)).sort().join(',');
    const docPart = targetDocuments.map((d) => String(d.id)).sort().join(',');
    return `f:${folderPart}|d:${docPart}`;
  }, [targetFolders, targetDocuments]);

  const itemsRef = useRef({ folders: targetFolders, documents: targetDocuments });
  itemsRef.current = { folders: targetFolders, documents: targetDocuments };

  const activeSessionIdRef = useRef(0);
  const fetchSeqRef = useRef(0);

  const [datarooms, setDatarooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDataroomIds, setSelectedDataroomIds] = useState([]);
  const [succeededDataroomIds, setSucceededDataroomIds] = useState([]);
  const [syncFolders, setSyncFolders] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorDetails, setErrorDetails] = useState([]);

  const fetchDataroomsList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setFetchError(false);
    try {
      const response = await getDatarooms(undefined, { skipErrorToast: true });
      if (seq !== fetchSeqRef.current) return;
      const data = response?.data;
      setDatarooms(Array.isArray(data) ? data : (data?.results || []));
    } catch {
      if (seq !== fetchSeqRef.current) return;
      setFetchError(true);
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    activeSessionIdRef.current += 1;
    fetchSeqRef.current += 1;
    setIsSubmitting(false);
    setErrorDetails([]);
    setSelectedDataroomIds([]);
    setSucceededDataroomIds([]);
    setSyncFolders(false);
    setSearchQuery('');

    if (isOpen && targetSignature !== 'f:|d:') {
      fetchDataroomsList();
    } else if (!isOpen) {
      setLoading(false);
      setFetchError(false);
    }
  }, [isOpen, targetSignature, fetchDataroomsList]);

  const syncInfoByDataroomId = useMemo(
    () => buildSyncInfoByDataroomId(targetFolders),
    [targetFolders]
  );

  const filteredDatarooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return datarooms;
    return datarooms.filter((dr) => (dr.name || '').toLowerCase().includes(query));
  }, [datarooms, searchQuery]);

  const selectableVisibleIds = useMemo(
    () =>
      filteredDatarooms
        .filter((dr) => !succeededDataroomIds.includes(dr.id))
        .map((dr) => dr.id),
    [filteredDatarooms, succeededDataroomIds]
  );

  const allSelectableVisibleChecked =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedDataroomIds.includes(id));

  const pendingSelectedIds = useMemo(
    () => selectedDataroomIds.filter((id) => !succeededDataroomIds.includes(id)),
    [selectedDataroomIds, succeededDataroomIds]
  );

  const toggleDataroom = (dataroomId) => {
    if (succeededDataroomIds.includes(dataroomId)) return;
    setSelectedDataroomIds((prev) =>
      prev.includes(dataroomId)
        ? prev.filter((id) => id !== dataroomId)
        : [...prev, dataroomId]
    );
  };

  const handleToggleSelectAll = () => {
    if (allSelectableVisibleChecked) {
      const visibleSet = new Set(selectableVisibleIds);
      setSelectedDataroomIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedDataroomIds((prev) => {
        const merged = new Set(prev);
        for (const id of selectableVisibleIds) {
          merged.add(id);
        }
        return Array.from(merged);
      });
    }
  };

  const handleConfirm = async () => {
    if (isSubmitting || pendingSelectedIds.length === 0) return;

    const sessionId = activeSessionIdRef.current;
    const isCurrentSession = () => sessionId === activeSessionIdRef.current;
    const currentItems = itemsRef.current;
    const folderIds = (currentItems?.folders || []).map((f) => f.id);
    const documentIds = (currentItems?.documents || []).map((d) => d.id);
    const shouldSync = folderIds.length > 0 ? syncFolders : false;
    const payload = {
      folder_ids: folderIds,
      document_ids: documentIds,
      sync_folders: shouldSync,
    };

    const targetRooms = pendingSelectedIds.map((id) => {
      const room = datarooms.find((dr) => dr.id === id);
      return { id, name: room?.name || String(id) };
    });

    setIsSubmitting(true);
    setErrorDetails([]);

    try {
      const settled = await Promise.allSettled(
        targetRooms.map((room) =>
          addContentToDataroom(room.id, payload, { skipErrorToast: true })
        )
      );

      if (!isCurrentSession()) return;

      const newlySucceededIds = [];
      const failedEntries = [];

      settled.forEach((result, index) => {
        const room = targetRooms[index];
        if (result.status === 'fulfilled') {
          newlySucceededIds.push(room.id);
        } else {
          failedEntries.push({
            id: room.id,
            name: room.name,
            detail: getLocalizedErrorMessage(result.reason, 'common.errorOccurred'),
          });
        }
      });

      if (newlySucceededIds.length > 0) {
        const succeededSet = new Set(newlySucceededIds);
        setSucceededDataroomIds((prev) => Array.from(new Set([...prev, ...newlySucceededIds])));
        setSelectedDataroomIds((prev) => prev.filter((id) => !succeededSet.has(id)));
      }

      setErrorDetails(failedEntries);

      if (failedEntries.length === 0) {
        toast.success(
          t('documents.addToDataroomsSuccess', { count: newlySucceededIds.length })
        );
        onSuccess?.({ syncedFoldersUsed: shouldSync, allSucceeded: true });
        onOpenChange(false);
      } else if (newlySucceededIds.length > 0) {
        toast.warning(
          t('documents.addToDataroomsPartialFailure', {
            added: newlySucceededIds.length,
            failed: failedEntries.length,
          })
        );
        onSuccess?.({ syncedFoldersUsed: shouldSync, allSucceeded: false });
      }
    } finally {
      if (isCurrentSession()) {
        setIsSubmitting(false);
      }
    }
  };

  const singleItemName =
    totalItemCount === 1
      ? targetFolders[0]?.name || targetDocuments[0]?.name || ''
      : '';

  const dialogTitle =
    totalItemCount === 1
      ? t('documents.addToDataroomsTitleSingle', { name: singleItemName })
      : t('documents.addToDataroomsTitleMultiple', { count: totalItemCount });

  const searchInputId = `${baseId}-search`;
  const syncCheckboxId = `${baseId}-sync-folders`;
  const syncHintId = `${baseId}-sync-hint`;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isSubmitting) {
          onOpenChange(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0 sm:text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-zinc-100">
            <FolderPlus className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{dialogTitle}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t('documents.addToDataroomsDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4 flex-1 overflow-y-auto space-y-3">
          {!loading && !fetchError && datarooms.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <label htmlFor={searchInputId} className="sr-only">
                  {t('datarooms.searchDatarooms')}
                </label>
                <input
                  id={searchInputId}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('datarooms.searchDatarooms')}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-md text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-slate-400 dark:focus:ring-zinc-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-2.5 top-2 pointer-events-none" aria-hidden="true" />
              </div>
              {selectableVisibleIds.length > 1 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  disabled={isSubmitting}
                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 disabled:opacity-50"
                >
                  {allSelectableVisibleChecked
                    ? t('documents.syncDeselectAll')
                    : t('documents.syncSelectAll')}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-2 py-2">
              <div className="h-11 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-11 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-11 bg-slate-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 p-6 text-center text-sm text-slate-500 dark:text-zinc-400 gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400" aria-hidden="true" />
              <span>{t('documents.failedToLoadDatarooms')}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchDataroomsList}
                className="mt-1 text-xs inline-flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('common.retry')}</span>
              </Button>
            </div>
          ) : datarooms.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 p-6 text-sm text-slate-500 dark:text-zinc-400">
              {t('datarooms.noDataroomsFound')}
            </div>
          ) : filteredDatarooms.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 p-6 text-sm text-slate-500 dark:text-zinc-400">
              {t('datarooms.noDataroomMatches')}
            </div>
          ) : (
            <div
              role="group"
              aria-label={t('datarooms.title')}
              className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-800 max-h-[260px] overflow-y-auto"
            >
              {filteredDatarooms.map((dataroom) => {
                const isSucceeded = succeededDataroomIds.includes(dataroom.id);
                const isChecked = !isSucceeded && selectedDataroomIds.includes(dataroom.id);
                const checkboxId = `${baseId}-dr-${dataroom.id}`;
                const hintId = `${baseId}-dr-hint-${dataroom.id}`;
                const syncInfo = syncInfoByDataroomId.get(String(dataroom.id));

                let syncHintText = '';
                if (syncInfo && syncInfo.folderIds.size > 0) {
                  if (targetFolders.length === 1 && syncInfo.paths.size > 0) {
                    syncHintText = t('documents.alreadySyncedAtPaths', {
                      paths: Array.from(syncInfo.paths).sort().join(', '),
                    });
                  } else {
                    syncHintText = t('documents.someFoldersAlreadySynced', {
                      count: syncInfo.folderIds.size,
                      total: targetFolders.length,
                    });
                  }
                }

                return (
                  <div
                    key={dataroom.id}
                    className={`flex items-start gap-3 px-3.5 py-2.5 transition-colors ${
                      isSucceeded
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 opacity-80'
                        : 'hover:bg-slate-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={isChecked}
                      onCheckedChange={() => toggleDataroom(dataroom.id)}
                      disabled={isSubmitting || isSucceeded}
                      aria-describedby={syncHintText ? hintId : undefined}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={checkboxId}
                          className={`flex items-center gap-1.5 min-w-0 flex-1 ${
                            isSucceeded ? 'cursor-default' : 'cursor-pointer'
                          }`}
                        >
                          <FolderKanban
                            className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-medium text-slate-800 dark:text-zinc-100">
                            {dataroom.name}
                          </span>
                        </label>
                        {isSucceeded && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            <span>{t('documents.addedToDataroomBadge')}</span>
                          </span>
                        )}
                      </div>
                      {syncHintText && (
                        <p
                          id={hintId}
                          className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 truncate"
                        >
                          {syncHintText}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasFolders && (
            <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40 px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id={syncCheckboxId}
                  checked={syncFolders}
                  onCheckedChange={(checked) => setSyncFolders(Boolean(checked))}
                  disabled={isSubmitting}
                  aria-describedby={syncHintId}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <label
                    htmlFor={syncCheckboxId}
                    className="block text-xs font-medium text-slate-800 dark:text-zinc-200 cursor-pointer"
                  >
                    {t('datarooms.keepFoldersSynced')}
                  </label>
                  <p id={syncHintId} className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {hasDocuments
                      ? t('documents.keepFoldersSyncedMixedHint')
                      : t('datarooms.keepFoldersSyncedHint')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {errorDetails.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1 min-w-0">
                {errorDetails.map((entry) => (
                  <p key={entry.id}>
                    {t('documents.syncPartialDetail', {
                      name: entry.name,
                      detail: entry.detail,
                    })}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 bg-slate-50/70 dark:bg-zinc-800/40 border-t border-slate-100 dark:border-zinc-800/80 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!isSubmitting) {
                onOpenChange(false);
              }
            }}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting || pendingSelectedIds.length === 0}
            className="inline-flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>{t('documents.addingToDatarooms')}</span>
              </>
            ) : (
              <>
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('documents.addToDataroomsConfirm')}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
