import { formatDate, formatRelativeTime } from '../../utils/formatters';
import { AlertTriangle, RefreshCw, Trash2, Folder, HardDrive, Calendar, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { formatBytes } from '../../lib/formatters';
import { FileTypeIcon } from '../documents/FileTypeIcon';

export function TrashItemInspectDialog({
  isOpen,
  onOpenChange,
  item,
  onRestore,
  onPermanentDelete,
}) {
  if (!item) return null;

  const isFolder = item.item_type === 'folder';
  const isRoot = !item.parent_name || item.parent_name === '__root__';
  const locationLabel = isRoot ? 'ROOT' : item.parent_name;
  const locationLink = isRoot ? '/documents' : `/documents/folders/${item.parent_id}`;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-w-[calc(100vw-2rem)] p-6 overflow-hidden">
        <DialogHeader className="pb-2 overflow-hidden">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileTypeIcon type={item.file_type || item.item_type} className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 pr-4 overflow-hidden">
              <DialogTitle className="text-base font-semibold text-foreground break-all leading-snug">
                {item.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground capitalize mt-0.5">
                Trashed {isFolder ? 'Folder' : 'Document'} Details
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Warning Banner */}
        <div className="rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs flex items-start gap-2.5 my-1">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="leading-normal">
            This item is in the Trash. Previews, downloads, and share links are disabled until restored.
          </div>
        </div>

        {/* Metadata Details Grid */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800 text-sm text-foreground my-1 overflow-hidden">
          <div className="flex items-center justify-between py-2.5 min-w-0 gap-2">
            <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
              <Folder className="h-4 w-4" />
              <span>Location</span>
            </div>
            <Link
              to={locationLink}
              onClick={() => onOpenChange(false)}
              className="font-medium hover:underline text-foreground truncate max-w-[220px]"
            >
              {locationLabel}
            </Link>
          </div>

          {!isFolder && (
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <HardDrive className="h-4 w-4" />
                <span>File Size</span>
              </div>
              <span className="font-medium">{item.size != null ? formatBytes(item.size) : '—'}</span>
            </div>
          )}

          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Deleted Date</span>
            </div>
            <span className="font-medium">
              {item.deleted_at
                ? `${formatDate(item.deleted_at, 'PPP')} (${formatRelativeTime(item.deleted_at)})`
                : '—'}
            </span>
          </div>

          {!isFolder && (
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span>Total Views</span>
              </div>
              <span className="font-medium">{item.view_count ?? 0}</span>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 flex items-center justify-between gap-2 sm:justify-between border-t dark:border-gray-800">
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onPermanentDelete(item);
            }}
            className="gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            Delete Permanently
          </Button>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onRestore(item);
            }}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Restore {isFolder ? 'Folder' : 'Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
