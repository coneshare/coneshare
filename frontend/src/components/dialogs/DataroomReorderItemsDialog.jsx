import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, FileIcon, FolderIcon, GripVertical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';

function moveItem(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function resetToFoldersFirst(items) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.id).localeCompare(String(b.id));
  });
  return sorted;
}

export function DataroomReorderItemsDialog({
  isOpen,
  onOpenChange,
  items = [],
  onConfirm,
  currentFolderName = null,
}) {
  const { t } = useTranslation();
  const [orderedItems, setOrderedItems] = useState(items);
  const [dragIndex, setDragIndex] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setOrderedItems(items);
  }, [isOpen, items]);

  const titleScope = useMemo(
    () => (currentFolderName ? t('datarooms.reorderScopeFolder', { name: currentFolderName }) : t('datarooms.reorderScopeRoot')),
    [currentFolderName, t]
  );

  const handleDrop = (targetIndex) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setOrderedItems((prev) => moveItem(prev, dragIndex, targetIndex));
    setDragIndex(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onConfirm(orderedItems);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetOrder = () => {
    setOrderedItems(resetToFoldersFirst(items));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('datarooms.reorderItemsTitle')}</DialogTitle>
          <DialogDescription>
            {t('datarooms.reorderDescription', { scope: titleScope })}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto rounded border border-gray-200 dark:border-gray-800">
          {orderedItems.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">{t('datarooms.noItemsToReorder')}</div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {orderedItems.map((item, index) => (
                <li
                  key={`${item.type}-${item.id}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/40"
                >
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="w-6 text-xs text-gray-500">{index + 1}</span>
                  {item.type === 'folder' ? (
                    <FolderIcon className="h-4 w-4 text-gray-500" />
                  ) : (
                    <FileIcon className="h-4 w-4 text-gray-500" />
                  )}
                  <span className="flex-1 truncate">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={index === 0}
                      onClick={() => setOrderedItems((prev) => moveItem(prev, index, index - 1))}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={index === orderedItems.length - 1}
                      onClick={() => setOrderedItems((prev) => moveItem(prev, index, index + 1))}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={handleResetOrder}
            disabled={isSaving || items.length === 0}
          >
            {t('datarooms.resetOrder')}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving || orderedItems.length === 0}>
            {isSaving ? t('common.saving') : t('datarooms.saveOrder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
