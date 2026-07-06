import { Eye, Upload, RefreshCw } from 'lucide-react';
import { Badge } from '../ui/Badge';
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

export function DocumentHeader({
  document,
  onCreateLink,
  onPreview,
  onUploadNewVersion,
  onImportVersionFromCloud,
  onRefreshFromCloud,
  onDownload,
  onVersionHistory,
  onDelete,
  isProcessing,
  cloudProviders = []
}) {
  return (
    <div className="border-b border-gray-200 pb-5 sm:flex sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold leading-6 text-gray-900">{document.name}</h1>
        {(document.uploader_info || document.cloud_import) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {document.uploader_info && (
              <Badge variant="secondary">
                Uploaded by {document.uploader_info.name} ({document.uploader_info.email})
              </Badge>
            )}
            {document.cloud_import && (
              <Badge className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-850">
                ☁️ Imported from {document.cloud_import.provider_display}
              </Badge>
            )}
          </div>
        )}
      </div>
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
                  disabled={document.download_only || isProcessing}
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

          {document.cloud_import && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="mr-2"
                    onClick={onRefreshFromCloud}
                    disabled={isProcessing}
                  >
                    <RefreshCw className={`h-5 w-5 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span className="sr-only">Refresh from {document.cloud_import.provider_display}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh from {document.cloud_import.provider_display}</p>
              </TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon"
                  className="mr-2"
                  disabled={isProcessing}
                >
                  <Upload className="h-5 w-5" />
                  <span className="sr-only">Upload New Version</span>
                </Button>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onUploadNewVersion}>
                Upload from Computer
              </DropdownMenuItem>
              {cloudProviders.length > 0 && <div className="my-1 h-px bg-gray-100 dark:bg-gray-800" />}
              {cloudProviders.map((provider) => (
                <DropdownMenuItem key={provider.name} onSelect={() => onImportVersionFromCloud(provider)}>
                  Import from {provider.display_name} {provider.is_connected ? '' : '(Connect)'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button className="mr-2" onClick={onCreateLink} disabled={isProcessing}>
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Create Link
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <Button variant="outline" size="icon" disabled={isProcessing}>
                  <ChevronDownIcon className="h-5 w-5" />
                  <span className="sr-only">More actions</span>
                </Button>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onDownload}>Download</DropdownMenuItem>
              <DropdownMenuItem onSelect={onVersionHistory}>Version History</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-red-600 hover:!text-red-600 hover:!bg-red-50 focus:!text-red-600 focus:!bg-red-50"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    </div>
  );
}
