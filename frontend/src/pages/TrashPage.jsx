import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast, Toaster } from 'sonner';
import { Trash2, RefreshCw, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { TrashList } from '../components/trash/TrashList';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { TrashItemInspectDialog } from '../components/dialogs/TrashItemInspectDialog';
import { getTrashItems, restoreTrashItem, permanentDeleteTrashItem, emptyTrash } from '../services/api';
import { TooltipProvider } from '../components/ui/Tooltip';
import { useUser } from '../contexts/UserProvider';

export default function TrashPage() {
  const { t } = useTranslation();
  const { refreshUser } = useUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  
  // Dialog States
  const [isConfirmEmptyOpen, setIsConfirmEmptyOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkRestoreOpen, setIsBulkRestoreOpen] = useState(false);
  const [inspectingItem, setInspectingItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTrash = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const response = await getTrashItems(pageNum);
      const loadedItems = response.data.results || response.data;
      setItems(loadedItems);
      setSelectedKeys(new Set());
      if (response.data.count != null) {
        setTotalPages(Math.max(1, Math.ceil(response.data.count / 20)));
      } else {
        setTotalPages(1);
      }
    } catch (error) {
      toast.error(t('trash.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTrash(page);
  }, [fetchTrash, page]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  // Selection handlers
  const handleToggleSelect = (itemKey) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  };

  const handleSelectAll = (shouldSelectAll) => {
    if (shouldSelectAll) {
      const allKeys = items.map((item) => `${item.item_type}-${item.id}`);
      setSelectedKeys(new Set(allKeys));
    } else {
      setSelectedKeys(new Set());
    }
  };

  // Single Item Restore
  const handleRestore = async (item) => {
    try {
      const res = await restoreTrashItem(item.id);
      const msg = res?.data?.detail || t('trash.restoreSuccess', { name: item.name });
      toast.success(msg);
      fetchTrash(page);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || t('trash.restoreFailed', { name: item.name });
      toast.error(errorMsg);
    }
  };

  // Single Item Delete
  const confirmPermanentDelete = (item) => {
    setItemToDelete(item);
    setIsConfirmDeleteOpen(true);
  };

  const handlePermanentDelete = async () => {
    if (!itemToDelete) return;
    try {
      await permanentDeleteTrashItem(itemToDelete.id);
      toast.success(t('trash.deleteSingleSuccess', { name: itemToDelete.name }));
      if (refreshUser) refreshUser();
      fetchTrash(page);
    } catch (error) {
      toast.error(t('trash.deleteSingleFailed', { name: itemToDelete.name }));
    } finally {
      setIsConfirmDeleteOpen(false);
      setItemToDelete(null);
    }
  };

  // Bulk Operations
  const handleBulkRestore = async () => {
    const selectedItems = items.filter((item) => selectedKeys.has(`${item.item_type}-${item.id}`));
    let successCount = 0;
    let lastErrorMessage = null;

    for (const item of selectedItems) {
      try {
        await restoreTrashItem(item.id);
        successCount++;
      } catch (err) {
        lastErrorMessage = err.response?.data?.detail || t('trash.restoreFailed', { name: item.name });
        console.error(`Failed to restore ${item.id}`, err);
      }
    }

    if (successCount === selectedItems.length) {
      toast.success(t('trash.restoreBulkSuccess', { successCount, totalCount: selectedItems.length }));
    } else if (successCount > 0) {
      toast.warning(`${t('trash.restoreBulkSuccess', { successCount, totalCount: selectedItems.length })}. ${lastErrorMessage || ''}`);
    } else {
      toast.error(lastErrorMessage || t('trash.restoreBulkFailed'));
    }
    setIsBulkRestoreOpen(false);
    fetchTrash(page);
  };

  const handleBulkDelete = async () => {
    const selectedItems = items.filter((item) => selectedKeys.has(`${item.item_type}-${item.id}`));
    let successCount = 0;

    for (const item of selectedItems) {
      try {
        await permanentDeleteTrashItem(item.id);
        successCount++;
      } catch (err) {
        console.error(`Failed to delete ${item.id}`, err);
      }
    }

    toast.success(t('trash.deleteBulkSuccess', { successCount, totalCount: selectedItems.length }));
    setIsBulkDeleteOpen(false);
    if (refreshUser) refreshUser();
    fetchTrash();
  };

  // Empty Trash
  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
      toast.success(t('trash.emptyTrashSuccess'));
      if (refreshUser) refreshUser();
      fetchTrash();
    } catch (error) {
      toast.error(t('trash.emptyTrashFailed'));
    } finally {
      setIsConfirmEmptyOpen(false);
    }
  };

  const selectedCount = selectedKeys.size;

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6 relative">
        <Toaster richColors />

        {/* Page Top Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('trash.title')}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('trash.subtitle')}
            </p>
          </div>
          <Button
            variant="destructive"
            disabled={items.length === 0 || loading}
            onClick={() => setIsConfirmEmptyOpen(true)}
          >
            {t('trash.emptyTrash')}
          </Button>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>
        ) : (
          <>
            <TrashList
              items={items}
              selectedKeys={selectedKeys}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onRestore={handleRestore}
              onPermanentDelete={confirmPermanentDelete}
              onInspectItem={(item) => setInspectingItem(item)}
            />
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('viewSessions.pageNumber', { number: `${page} / ${totalPages}` })}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Floating Action Bar for Multi-Selection */}
        {selectedCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl border border-gray-800 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <span className="text-sm font-medium">{t('trash.itemsSelected', { count: selectedCount })}</span>
            <div className="h-4 w-px bg-gray-700" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBulkRestoreOpen(true)}
              className="gap-1.5 bg-gray-800 text-white border-gray-700 hover:bg-gray-700 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('trash.restoreSelected')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('trash.deleteSelectedPermanently')}
            </Button>
            <button
              onClick={() => setSelectedKeys(new Set())}
              className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800 transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Item Inspection Modal */}
        <TrashItemInspectDialog
          isOpen={!!inspectingItem}
          onOpenChange={(open) => !open && setInspectingItem(null)}
          item={inspectingItem}
          onRestore={handleRestore}
          onPermanentDelete={confirmPermanentDelete}
        />

        {/* Confirmation Dialogs */}
        <ConfirmationDialog
          isOpen={isConfirmDeleteOpen}
          onOpenChange={(open) => setIsConfirmDeleteOpen(open)}
          onConfirm={handlePermanentDelete}
          title={t('trash.deleteSingleTitle')}
          description={t('trash.deleteSingleDescription', { name: itemToDelete?.name || '' })}
          confirmText={t('trash.deletePermanently')}
        />

        <ConfirmationDialog
          isOpen={isConfirmEmptyOpen}
          onOpenChange={(open) => setIsConfirmEmptyOpen(open)}
          onConfirm={handleEmptyTrash}
          title={t('trash.emptyTrashTitle')}
          description={t('trash.emptyTrashDescription')}
          confirmText={t('trash.emptyTrash')}
        />

        <ConfirmationDialog
          isOpen={isBulkDeleteOpen}
          onOpenChange={(open) => setIsBulkDeleteOpen(open)}
          onConfirm={handleBulkDelete}
          title={t('trash.deleteSelectedTitle')}
          description={t('trash.deleteSelectedDescription', { count: selectedCount })}
          confirmText={t('trash.deletePermanently')}
        />

        <ConfirmationDialog
          isOpen={isBulkRestoreOpen}
          onOpenChange={(open) => setIsBulkRestoreOpen(open)}
          onConfirm={handleBulkRestore}
          title={t('trash.restoreSelectedTitle')}
          description={t('trash.restoreSelectedDescription', { count: selectedCount })}
          confirmText={t('trash.restoreSelected')}
        />
      </div>
    </TooltipProvider>
  );
}
