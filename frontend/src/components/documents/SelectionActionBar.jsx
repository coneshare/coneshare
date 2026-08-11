import { useTranslation } from "react-i18next";
import { Trash2, FolderInput } from "lucide-react";
import { Button } from "../ui/Button";

export function SelectionActionBar({
  selectedDocumentsCount,
  selectedFoldersCount,
  onClearSelection,
  onDelete,
  onMove,
  deleteText,
}) {
  const { t } = useTranslation();
  const totalSelected = (selectedDocumentsCount || 0) + (selectedFoldersCount || 0);
  const selectionText = t('documents.selectedCount', { count: totalSelected });
  const actualDeleteText = deleteText || t('common.delete');

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
      <div className="flex items-center gap-x-4">
        <span className="ml-2 text-sm font-medium">{selectionText}</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          {t('documents.clearSelection')}
        </Button>
      </div>
      <div className="flex items-center gap-x-2">
        <Button variant="outline" size="sm" onClick={onMove}>
          <FolderInput className="mr-2 h-4 w-4" />
          {t('documents.move')}
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          {actualDeleteText}
        </Button>
      </div>
    </div>
  );
}
