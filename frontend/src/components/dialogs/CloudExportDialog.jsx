import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { Folder as FolderIcon, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { getCloudConnections, listCloudFolders, exportFileRequestUploads } from '../../services/api';
import { getLocalizedErrorMessage } from '../../utils/errorTranslator';

export function CloudExportDialog({ isOpen, onOpenChange, requestId, selectedFileIds, onExportSuccess }) {
  const { t } = useTranslation();
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [pathHistory, setPathHistory] = useState([]);

  // Fetch connections
  const fetchConnections = useCallback(async () => {
    setLoadingConnections(true);
    setError(null);
    try {
      const response = await getCloudConnections();
      setConnections(response.data);
      if (response.data.length > 0) {
        setSelectedConnection(response.data[0]);
      }
    } catch (err) {
      console.error('Failed to load cloud connections:', err);
      setError(t('cloudExport.loadConnectionsFailed'));
    } finally {
      setLoadingConnections(false);
    }
  }, [t]);

  // Fetch folders for selected connection
  const fetchFolders = useCallback(async (connectionId, path) => {
    if (!connectionId) return;
    setLoadingFolders(true);
    setError(null);
    try {
      const response = await listCloudFolders(connectionId, path);
      // Sort folders by name
      const sortedFolders = response.data.sort((a, b) => a.name.localeCompare(b.name));
      setFolders(sortedFolders);
    } catch (err) {
      console.error('Failed to list folders:', err);
      setError(getLocalizedErrorMessage(err, 'cloudExport.loadFoldersFailed'));
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCurrentPath('/');
      setPathHistory([]);
      setFolders([]);
      setSelectedConnection(null);
      setError(null);
      fetchConnections();
    }
  }, [isOpen, fetchConnections]);

  useEffect(() => {
    if (selectedConnection) {
      setCurrentPath('/');
      setPathHistory([]);
      fetchFolders(selectedConnection.id, '/');
    }
  }, [selectedConnection, fetchFolders]);

  const handleFolderClick = (folder) => {
    setPathHistory(prev => [...prev, currentPath]);
    setCurrentPath(folder.path);
    fetchFolders(selectedConnection.id, folder.path);
  };

  const handleBackClick = () => {
    const previousPath = pathHistory[pathHistory.length - 1];
    setPathHistory(prev => prev.slice(0, -1));
    setCurrentPath(previousPath);
    fetchFolders(selectedConnection.id, previousPath);
  };

  const handleExport = async () => {
    if (!selectedConnection) return;
    setExporting(true);
    try {
      await exportFileRequestUploads(requestId, {
        connection_id: selectedConnection.id,
        uploaded_file_ids: selectedFileIds,
        destination_folder_id: currentPath,
      });
      toast.success(t('cloudExport.exportSuccess'));
      if (onExportSuccess) {
        onExportSuccess();
      }
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to initiate export:', err);
      // toast is handled by api interceptor
    } finally {
      setExporting(false);
    }
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('cloudExport.title')}</DialogTitle>
          <DialogDescription>
            {t('cloudExport.description')}
          </DialogDescription>
        </DialogHeader>

        {loadingConnections ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : connections.length === 0 ? (
          <div className="my-6 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-center dark:border-yellow-900/30 dark:bg-yellow-950/20">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-yellow-600 dark:text-yellow-500" />
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {t('cloudExport.noConnections')}
            </p>
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-400">
              {t('cloudExport.noConnectionsNotice')}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="connection-select" className="text-sm font-medium text-muted-foreground min-w-[120px]">
                {t('cloudExport.storageAccount')}
              </label>
              <select
                id="connection-select"
                value={selectedConnection?.id || ''}
                onChange={(e) => {
                  const conn = connections.find(c => c.id === e.target.value);
                  setSelectedConnection(conn);
                }}
                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.provider === 'dropbox' ? 'Dropbox' : c.provider === 'google_drive' ? 'Google Drive' : 'Nextcloud'} ({c.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackClick}
                disabled={pathHistory.length === 0 || loadingFolders}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('cloudImport.back')}
              </Button>
              <span className="text-xs text-muted-foreground truncate max-w-[400px]">
                {t('cloudImport.browsing', { path: '/' + breadcrumbs.join('/') })}
              </span>
            </div>

            <div className="h-[280px] overflow-y-auto rounded-md border">
              {loadingFolders ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                </div>
              ) : error ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => fetchFolders(selectedConnection?.id, currentPath)}
                  >
                    {t('cloudImport.retry')}
                  </Button>
                </div>
              ) : folders.length === 0 ? (
                <div className="flex h-full items-center justify-center p-4 text-muted-foreground text-sm">
                  {t('cloudExport.noFolders')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cloudExport.folderName')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {folders.map((folder) => (
                      <TableRow key={folder.id}>
                        <TableCell>
                          <button
                            className="flex w-full items-center gap-x-2 text-left hover:underline"
                            onClick={() => handleFolderClick(folder)}
                          >
                            <FolderIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-x-2">
          <Button
            variant="outline"
            onClick={() => {
              if (!exporting) {
                onOpenChange(false);
              }
            }}
            disabled={exporting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleExport}
            disabled={!selectedConnection || loadingFolders || exporting || connections.length === 0 || !selectedFileIds || selectedFileIds.length === 0}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('automations.replaying')}
              </>
            ) : (
              t('cloudExport.exportCount', { count: selectedFileIds?.length || 0 })
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
