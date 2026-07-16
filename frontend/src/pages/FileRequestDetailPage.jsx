import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { getFileRequest, getDocumentDownloadUrl, updateFileRequest } from '../services/api';
import { useBreadcrumb } from '../components/layout/BreadcrumbProvider';
import { Download, Copy, CloudUpload, CheckCircle, AlertCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { ROOT_FOLDER_NAME } from '../lib/constants';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/Tooltip';
import { CloudExportDialog } from '../components/dialogs/CloudExportDialog';

const formatSubmittedFieldValue = (field) => {
  if (field.type === 'checkbox') {
    return field.value ? 'Yes' : 'No';
  }
  return String(field.value);
};

const renderExportStatus = (file) => {
  if (file.document_status && file.document_status !== 'ready') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-x-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-600/20 dark:bg-slate-900/30 dark:text-slate-400">
            <RefreshCw className="h-3 w-3 animate-spin text-slate-500" />
            Processing
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>File is currently being processed/scanned. Export will be available once ready.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const latestJob = file.export_jobs && file.export_jobs[0];
  if (!latestJob) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const { status, error_message, provider_display, updated_at } = latestJob;

  const timeInfo = updated_at
    ? ` (${formatDistanceToNow(new Date(updated_at), { addSuffix: true })})`
    : '';

  switch (status) {
    case 'queued':
      return (
        <span className="inline-flex items-center gap-x-1.5 rounded-full bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-950/20 dark:text-yellow-400">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
          Queued
        </span>
      );
    case 'exporting':
      return (
        <span className="inline-flex items-center gap-x-1.5 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-950/20 dark:text-blue-400">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Exporting
        </span>
      );
    case 'exported':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-x-1.5 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-950/20 dark:text-green-400">
              <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
              Exported
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Exported to {provider_display}{timeInfo}</p>
          </TooltipContent>
        </Tooltip>
      );
    case 'failed':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-x-1.5 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-950/20 dark:text-red-400 cursor-help">
              <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-500" />
              Failed
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="max-w-xs">{error_message || 'Unknown export error.'}</p>
              {updated_at && (
                <p className="text-xs text-muted-foreground">
                  Failed{timeInfo}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    case 'blocked_security_scan':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-x-1.5 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 dark:bg-red-950/20 dark:text-red-400 cursor-help">
              <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-500" />
              Blocked (Scan)
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="max-w-xs">{error_message || 'Blocked due to security scan requirements.'}</p>
              {updated_at && (
                <p className="text-xs text-muted-foreground">
                  Blocked{timeInfo}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    case 'blocked_policy':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-x-1.5 rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-600/10 dark:bg-gray-950/20 dark:text-gray-400 cursor-help">
              <AlertCircle className="h-3.5 w-3.5 text-gray-500" />
              Blocked (Policy)
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="max-w-xs">{error_message || 'Blocked by organization export policies.'}</p>
              {updated_at && (
                <p className="text-xs text-muted-foreground">
                  Blocked{timeInfo}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    default:
      return <span className="text-xs text-muted-foreground">{status}</span>;
  }
};

export function FileRequestDetailPage() {
  const { requestId } = useParams();
  const { setBreadcrumbData } = useBreadcrumb();
  const [fileRequest, setFileRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [exportTargetFileIds, setExportTargetFileIds] = useState([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const handleSelectFile = (fileId) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const handleSelectAll = () => {
    if (!fileRequest) return;
    const readyFiles = fileRequest.uploaded_files.filter(f => !f.document_status || f.document_status === 'ready');
    if (readyFiles.length === 0) return;
    if (selectedFileIds.length === readyFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(readyFiles.map(f => f.id));
    }
  };

  const handleOpenExportDialog = (fileId = null) => {
    if (fileId) {
      setExportTargetFileIds([fileId]);
    } else {
      setExportTargetFileIds(selectedFileIds);
    }
    setExportDialogOpen(true);
  };

  const handleCopyLink = () => {
    if (!fileRequest?.slug) return;
    const url = `${window.location.origin}/u/${fileRequest.slug}`;
    navigator.clipboard.writeText(url);
    toast.success('File request link copied to clipboard!');
  };

  const handleDownload = async (documentId, documentName) => {
    try {
      const response = await getDocumentDownloadUrl(documentId);
      const link = document.createElement('a');
      link.href = response.data.download_url;
      link.download = documentName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast.error(`Failed to download ${documentName}`);
      console.error(error);
    }
  };

  const handleStatusChange = async (checked) => {
    try {
      await updateFileRequest(requestId, { is_active: checked });
      setFileRequest(prev => ({ ...prev, is_active: checked }));
      toast.success(`File request is now ${checked ? 'active' : 'inactive'}`);
    } catch (error) {
      toast.error('Failed to update status.');
      console.error('Failed to update status:', error);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getFileRequest(requestId);
      setFileRequest(response.data);
      setBreadcrumbData({
        type: 'fileRequest',
        fileRequestName: response.data.name || 'Untitled Request',
      });
    } catch (error) {
      toast.error('Failed to fetch file request details.');
      console.error('Failed to fetch file request details:', error);
    } finally {
      setLoading(false);
    }
  }, [requestId, setBreadcrumbData]);

  useEffect(() => {
    fetchData();
    return () => {
      setBreadcrumbData(null);
    };
  }, [fetchData, setBreadcrumbData]);

  if (!loading && !fileRequest) {
    return <div className="p-4 sm:p-6 text-center">File request not found.</div>;
  }

  const isExpired = fileRequest?.expires_at && new Date(fileRequest.expires_at) < new Date();

  return (
    <TooltipProvider>
      <div className="p-4 sm:p-6">
        <Toaster richColors />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">Uploaded Files ({fileRequest?.uploaded_files?.length || 0})</h2>
            {isExpired && (
              <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                Expired
              </span>
            )}
          </div>
          {fileRequest && (
            <div className="flex items-center gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex align-middle">
                    <Switch
                      checked={fileRequest.is_active}
                      onCheckedChange={handleStatusChange}
                      aria-label="Toggle link status"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{fileRequest.is_active ? 'Active' : 'Inactive'}</p>
                </TooltipContent>
              </Tooltip>
              {selectedFileIds.length > 0 && (
                <Button onClick={() => handleOpenExportDialog()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <CloudUpload className="mr-2 h-4 w-4" />
                  Export Selected ({selectedFileIds.length})
                </Button>
              )}
              <Button onClick={handleCopyLink} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
            </div>
          )}
        </div>
      <div className="rounded-lg border">
        <div className="flex items-center border-b bg-gray-50 px-4 py-3 text-sm font-medium text-muted-foreground dark:bg-gray-900/50">
          <div className="w-[5%]">
            <input
              type="checkbox"
              checked={
                selectedFileIds.length > 0 &&
                fileRequest?.uploaded_files?.filter(f => !f.document_status || f.document_status === 'ready').length > 0 &&
                selectedFileIds.length === fileRequest?.uploaded_files?.filter(f => !f.document_status || f.document_status === 'ready').length
              }
              onChange={handleSelectAll}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <div className="w-[25%]">File Name</div>
          <div className="w-[15%]">Destination Folder</div>
          <div className="w-[15%]">Uploader</div>
          <div className="w-[15%]">Export Status</div>
          <div className="w-[15%]">Uploaded At</div>
          <div className="w-[10%] text-right">Actions</div>
        </div>
        <div>
          {loading ? (
            <div className="p-4 text-center">Loading...</div>
          ) : fileRequest.uploaded_files.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No files have been uploaded to this link yet.</p>
            </div>
          ) : (
            fileRequest.uploaded_files.map((file) => {
              const submittedFields = file.submitted_fields || {};
              const submittedEntries = Object.entries(submittedFields);
              const isReady = !file.document_status || file.document_status === 'ready';

              return (
                <div key={file.id} className="border-b">
                  <div className="flex w-full items-center px-4 py-2 text-sm">
                    <div className="w-[5%]">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.includes(file.id)}
                        disabled={!isReady}
                        onChange={() => handleSelectFile(file.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="w-[25%] truncate font-medium">
                      <Link to={`/documents/${file.document_id}`} className="hover:underline">
                        {file.document_name}
                      </Link>
                    </div>
                    <div className="w-[15%] truncate">
                      {file.folder_name === ROOT_FOLDER_NAME ? (
                        <Link to="/documents" className="hover:underline">
                          Root
                        </Link>
                      ) : (
                        <Link to={`/documents/folders/${file.folder_id}`} className="hover:underline">
                          {file.folder_name}
                        </Link>
                      )}
                    </div>
                    <div className="w-[15%] truncate">{file.uploader_name}</div>
                    <div className="w-[15%]">{renderExportStatus(file)}</div>
                    <div className="w-[15%]">
                      {formatDistanceToNow(new Date(file.created_at), { addSuffix: true })}
                    </div>
                    <div className="w-[10%] flex justify-end gap-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(file.document_id, file.document_name)}
                        title={`Download ${file.document_name}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenExportDialog(file.id)}
                              disabled={!isReady}
                            >
                              <CloudUpload className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isReady ? 'Export to cloud' : 'File is still being processed and scanned'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {submittedEntries.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 bg-muted/20 px-4 pb-3 pl-[30%] text-xs sm:grid-cols-2">
                      {submittedEntries.map(([fieldId, value]) => (
                        <div key={fieldId} className="min-w-0">
                          <span className="font-medium text-muted-foreground">
                            {value.label}:
                          </span>{' '}
                          <span className="break-words">{formatSubmittedFieldValue(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      {fileRequest && (
        <CloudExportDialog
          isOpen={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          requestId={fileRequest.id}
          selectedFileIds={exportTargetFileIds}
          onExportSuccess={() => {
            setSelectedFileIds([]);
            setExportTargetFileIds([]);
            fetchData();
          }}
        />
      )}
    </div>
    </TooltipProvider>
  );
}
