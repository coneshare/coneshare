import { Eye, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';
import { ChevronDownIcon } from '../icons/ChevronDownIcon';
import { PlusIcon } from '../icons/PlusIcon';

export function DocumentHeader({ document, onCreateLink, onPreview }) {
  return (
    <div className="border-b border-gray-200 pb-5 sm:flex sm:items-center sm:justify-between">
      <h1 className="text-2xl font-bold leading-6 text-gray-900">{document.name}</h1>
      <TooltipProvider>
        <div className="mt-3 flex sm:ml-4 sm:mt-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon"
                  className="mr-2"
                  onClick={onPreview}
                  disabled={document.download_only}
                  style={document.download_only ? { pointerEvents: 'none' } : {}}
                >
                  <Eye className="h-5 w-5" />
                  <span className="sr-only">Preview</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {document.download_only ? (
                <p>Preview not available for this file type.</p>
              ) : (
                <p>Preview</p>
              )}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="mr-2">
                <Upload className="h-5 w-5" />
                <span className="sr-only">Upload New Version</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Upload New Version</p>
            </TooltipContent>
          </Tooltip>
        <Button className="mr-2" onClick={onCreateLink}>
          <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
          Create Link
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <ChevronDownIcon className="h-5 w-5" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Download</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 hover:!text-red-600 hover:!bg-red-50 focus:!text-red-600 focus:!bg-red-50">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </TooltipProvider>
    </div>
  );
}
