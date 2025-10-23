import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { Folder as FolderIcon, File as FileIcon, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { listCloudFiles, importCloudFile } from '../../services/api';
import { formatBytes } from '../../lib/formatters';

export function CloudImportDialog({ isOpen, onOpenChange, provider, connection, onImportSuccess }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importingFileId, setImportingFileId] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [pathHistory, setPathHistory] = useState([]);

  const fetchFiles = useCallback(async (path) => {
    if (!connection) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listCloudFiles(connection.id, path);
      // Sort folders first, then by name
      const sortedItems = response.data.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return a.name.localeCompare(b.name);
      });
      setItems(sortedItems);
    } catch (error) {
      console.error(`Failed to list files from ${provider.display_name}:`, error);
      // Toast is shown by interceptor, but we also show an error in the dialog
      setError(error.response?.data?.detail || `Failed to load files. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [connection, provider]);

  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      setCurrentPath('/');
      setPathHistory([]);
      setItems([]);
      setError(null);
      fetchFiles('/');
    }
  }, [isOpen, fetchFiles]);

  const handleFolderClick = (folder) => {
    setPathHistory(prev => [...prev, currentPath]);
    setCurrentPath(folder.path);
    fetchFiles(folder.path);
  };

  const handleBackClick = () => {
    const previousPath = pathHistory[pathHistory.length - 1];
    setPathHistory(prev => prev.slice(0, -1));
    setCurrentPath(previousPath);
    fetchFiles(previousPath);
  };

  const handleImportClick = async (file) => {
    setImportingFileId(file.id);
    try {
      await importCloudFile(connection.id, {
        fileId: file.id,
        fileName: file.name,
        fileSize: file.size,
      });
      toast.success(`Import started for "${file.name}". It will appear in your documents list shortly.`);
      onImportSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to start import:", error);
      // Toast is shown by interceptor
    } finally {
      setImportingFileId(null);
    }
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import from {provider?.display_name}</DialogTitle>
          <DialogDescription>Browsing: /{breadcrumbs.join('/')}</DialogDescription>
        </DialogHeader>
      <div className="mt-4 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackClick}
          disabled={pathHistory.length === 0 || loading}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
      <div className="mt-4 h-[400px] overflow-y-auto rounded-md border">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchFiles(currentPath)}>
              Retry
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-32 text-right">Size</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-x-2">
                      {item.type === 'folder' ? (
                        <FolderIcon className="h-5 w-5 text-blue-500" />
                      ) : (
                        <FileIcon className="h-5 w-5 text-gray-500" />
                      )}
                      {item.type === 'folder' ? (
                        <button
                          className="text-left hover:underline"
                          onClick={() => handleFolderClick(item)}
                        >
                          {item.name}
                        </button>
                      ) : (
                        <span>{item.name}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.type === 'file' && item.size != null ? formatBytes(item.size) : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.type === 'file' && (
                      <Button
                        size="sm"
                        onClick={() => handleImportClick(item)}
                        disabled={importingFileId === item.id}
                      >
                        {importingFileId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Import'
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </DialogContent>
    </Dialog>
  );
}
