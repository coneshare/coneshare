import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Upload, RefreshCw, Pencil } from 'lucide-react';
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
  onRenameDocument,
  isProcessing,
  cloudProviders = []
}) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(document.name);

  useEffect(() => {
    setEditedName(document.name);
  }, [document.name]);

  const handleStartEdit = () => {
    if (isProcessing) return;
    setEditedName(document.name);
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    const trimmed = editedName.trim();
    if (!trimmed) {
      setEditedName(document.name);
      return;
    }
    if (trimmed !== document.name) {
      onRenameDocument(trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditedName(document.name);
    }
  };

  return (
    <TooltipProvider>
      <div className="border-b border-gray-200 pb-5 sm:flex sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0 mr-4">
          {isEditing ? (
            <input
              type="text"
              className="text-2xl font-bold leading-6 text-gray-900 border-b border-gray-900 focus:outline-none bg-transparent w-full focus:border-b-2 py-0"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 group max-w-full">
              <h1 
                className="text-2xl font-bold leading-6 text-gray-900 truncate cursor-pointer hover:bg-gray-100/50 rounded px-1 -mx-1"
                onClick={handleStartEdit}
                title="Click to rename"
              >
                {document.name}
              </h1>
              <button
                onClick={handleStartEdit}
                disabled={isProcessing}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600 focus:opacity-100 disabled:pointer-events-none"
                title="Rename Document"
                aria-label="Rename Document"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {document.updated_at && (
              <span className="text-xs text-gray-500 mr-1">
                Last updated: {new Date(document.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            )}
            {document.uploader_info && (
              <Badge variant="secondary">
                Uploaded by {document.uploader_info.name} ({document.uploader_info.email})
              </Badge>
            )}
            {document.cloud_import && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-850 cursor-help">
                      ☁️ Imported from {document.cloud_import.provider_display}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1.5 p-1 text-xs">
                    <div className="font-semibold border-b border-gray-700/50 pb-1 mb-1">
                      Cloud Import Details
                    </div>
                    <div>
                      <span className="text-gray-400">Provider:</span> {document.cloud_import.provider_display}
                    </div>
                    <div>
                      <span className="text-gray-400">Source Path:</span> <code className="bg-gray-800 dark:bg-gray-750 px-1 rounded break-all">{document.cloud_import.file_id || 'N/A'}</code>
                    </div>
                    {document.cloud_import.etag_or_rev && (
                      <div>
                        <span className="text-gray-400">Revision:</span> <code className="bg-gray-800 dark:bg-gray-750 px-1 rounded break-all">{document.cloud_import.etag_or_rev}</code>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <DropdownMenuTrigger asChild disabled={isProcessing}>
                    <Button
                      variant="outline"
                      size="icon"
                      className="mr-2"
                      disabled={isProcessing}
                    >
                      <Upload className="h-5 w-5" />
                      <span className="sr-only">Upload New Version</span>
                    </Button>
                  </DropdownMenuTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Upload New Version</p>
              </TooltipContent>
            </Tooltip>
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
            {t('documents.getLink')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isProcessing}>
              <Button variant="outline" size="icon" disabled={isProcessing}>
                <ChevronDownIcon className="h-5 w-5" />
                <span className="sr-only">{t('common.actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onDownload}>{t('documents.download')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onVersionHistory}>{t('documents.versions')}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-red-600 hover:!text-red-600 hover:!bg-red-50 focus:!text-red-600 focus:!bg-red-50"
              >
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  );
}
