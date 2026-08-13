import { useTranslation } from 'react-i18next';
import { MoreVertical, Eye, Pencil, Trash2, ShieldCheck, Copy } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { copyTextToClipboard } from '../../lib/utils';

const copyLinkToClipboard = (slug, t) => {
  const url = `${window.location.origin}/view/${slug}`;
  copyTextToClipboard(url, t('links.copiedToClipboard'));
};

export function LinkActionsDropdown({
  link,
  onPreview,
  onEdit,
  onDelete,
  onManagePermissions,
  contextType,
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">{t('common.actions')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        {onPreview && (
          <DropdownMenuItem onSelect={() => onPreview(link.id, link.slug)}>
            <Eye className="mr-2 h-4 w-4" /> <span>{t('viewer.preview')}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onEdit(link)}>
          <Pencil className="mr-2 h-4 w-4" /> <span>{t('common.edit')}</span>
        </DropdownMenuItem>
        {contextType === 'dataroom' && (
          <DropdownMenuItem onSelect={() => onManagePermissions(link)}>
            <ShieldCheck className="mr-2 h-4 w-4" /> <span>{t('documents.managePermissions')}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => copyLinkToClipboard(link.slug, t)}
          data-testid={`copy-link-menu-item-${link.id}`}
        >
          <Copy className="mr-2 h-4 w-4" /> <span>{t('links.copyLink')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDelete(link)} className="text-red-600 focus:text-red-600">
          <Trash2 className="mr-2 h-4 w-4" /> <span>{t('common.delete')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
