import { useTranslation } from 'react-i18next';
import { Trash2, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { formatBytes } from '../../lib/formatters';
import { FileTypeIcon } from '../documents/FileTypeIcon';

function LocationCell({ item, t }) {
  const isRoot = !item.parent_name || item.parent_name === '__root__';
  const label = isRoot ? t('viewer.root') : item.parent_name;
  const linkTo = isRoot ? '/documents' : `/documents/folders/${item.parent_id}`;

  return (
    <Link
      to={linkTo}
      onClick={(e) => e.stopPropagation()}
      className="hover:underline truncate max-w-xs inline-block text-foreground"
    >
      {label}
    </Link>
  );
}

export function TrashList({
  items,
  selectedKeys,
  onToggleSelect,
  onSelectAll,
  onRestore,
  onPermanentDelete,
  onInspectItem,
}) {
  const { t } = useTranslation();

  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Trash2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/60" />
        <p className="font-medium text-foreground">{t('trash.trashIsEmpty')}</p>
        <p className="text-sm mt-1">{t('trash.emptyStateNotice')}</p>
      </div>
    );
  }

  const allSelected = items.length > 0 && items.every((item) => selectedKeys.has(`${item.item_type}-${item.id}`));
  const someSelected = items.some((item) => selectedKeys.has(`${item.item_type}-${item.id}`));

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 border-b text-xs font-medium text-muted-foreground dark:bg-gray-900/50">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th className="px-4 py-3">{t('analytics.name')}</th>
            <th className="px-4 py-3">{t('fileRequests.fieldType')}</th>
            <th className="px-4 py-3">{t('trash.location')}</th>
            <th className="px-4 py-3">{t('trash.deletedDate')}</th>
            <th className="px-4 py-3">{t('trash.size')}</th>
            <th className="px-4 py-3 text-right">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y border-b text-sm">
          {items.map((item) => {
            const itemKey = `${item.item_type}-${item.id}`;
            const isSelected = selectedKeys.has(itemKey);

            return (
              <tr
                key={itemKey}
                className={`group border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer ${
                  isSelected ? 'bg-gray-100/60 dark:bg-gray-800/60' : ''
                }`}
                onClick={(e) => {
                  if (
                    e.target.closest('button') ||
                    e.target.closest('a') ||
                    e.target.closest('input[type="checkbox"]')
                  ) {
                    return;
                  }
                  onInspectItem(item);
                }}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={isSelected}
                    onChange={() => onToggleSelect(itemKey)}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 font-medium text-foreground">
                    <FileTypeIcon type={item.file_type || item.item_type} className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate max-w-xs">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{item.file_type || item.item_type}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  <LocationCell item={item} t={t} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {item.deleted_at ? formatRelativeTime(item.deleted_at) : '-'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {item.item_type === 'folder' || item.size == null ? '-' : formatBytes(item.size)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRestore(item)}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t('trash.restore')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onPermanentDelete(item)}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
