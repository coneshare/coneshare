import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Edit, MoreHorizontal, Share2, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

export function ActionsDropdown({ item, type, onRename, onDelete, onShare }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={(e) => {
            // Prevent card's link navigation when clicking the trigger
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={`Actions for ${item.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        className="z-20 w-48 origin-top-right rounded-md bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800"
        sideOffset={5}
        align="end"
        // Prevent focus from returning to trigger, which can re-trigger card navigation.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenu.Item
          onSelect={() => onRename(item)}
          className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
        >
          <Edit className="h-4 w-4" aria-hidden="true" />
          <span>Rename</span>
        </DropdownMenu.Item>

        {type === 'document' && onShare && (
           <DropdownMenu.Item
            onSelect={() => onShare(item)}
            className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:text-gray-200 hover:dark:bg-gray-700 focus:dark:bg-gray-700"
           >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>Share</span>
          </DropdownMenu.Item>
        )}

        <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
        
        <DropdownMenu.Item
          onSelect={() => onDelete(item)}
          className="flex w-full cursor-pointer items-center gap-x-2 rounded-sm px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700 focus:outline-none dark:text-red-500 dark:hover:bg-red-900/20 dark:focus:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>Delete</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
