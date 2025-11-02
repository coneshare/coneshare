import { MoreVertical, Eye, Pencil, Trash2, ShieldCheck, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

const copyLinkToClipboard = (slug) => {
  const url = `${window.location.origin}/view/${slug}`;
  navigator.clipboard.writeText(url);
  toast.success('Link copied to clipboard!');
};

export function LinkActionsDropdown({
  link,
  onPreview,
  onEdit,
  onDelete,
  onManagePermissions,
  contextType,
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {contextType === 'document' && (
          <DropdownMenuItem onClick={() => onPreview(link.id, link.slug)}>
            <Eye className="mr-2 h-4 w-4" /> <span>Preview</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onEdit(link)}>
          <Pencil className="mr-2 h-4 w-4" /> <span>Edit</span>
        </DropdownMenuItem>
        {contextType === 'dataroom' && (
          <DropdownMenuItem onClick={() => onManagePermissions(link)}>
            <ShieldCheck className="mr-2 h-4 w-4" /> <span>Manage Permissions</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => copyLinkToClipboard(link.slug)}>
          <Copy className="mr-2 h-4 w-4" /> <span>Copy Link</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(link)} className="text-red-600 focus:text-red-600">
          <Trash2 className="mr-2 h-4 w-4" /> <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
