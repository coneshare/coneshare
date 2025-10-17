import { MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

export function LinkActionsDropdown({ link, onPreview, onEdit, onDelete }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onPreview(link.id, link.slug)}>
          <Eye className="mr-2 h-4 w-4" />
          <span>Preview</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(link)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Edit</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete(link)} className="text-red-600 focus:text-red-600">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
