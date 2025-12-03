import { useState, useMemo } from 'react';
import {
  FolderIcon,
  HomeIcon,
  ChevronRight,
  FileImageIcon,
  FileTextIcon,
  FileQuestion,
  DownloadIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { DataroomDocumentPreview } from './DataroomDocumentPreview';
import { Dialog, DialogContent } from '../ui/Dialog';
import { formatBytes } from '../../lib/formatters';
import { Button } from '../ui/Button';
import { downloadDataroomFolder, recordDataroomVisit } from '../../services/api';

function DocumentItemIcon({ type }) {
  const commonProps = { className: "h-5 w-5 text-gray-500" };
  switch (type) {
    case 'pdf':
    case 'document':
      return <FileTextIcon {...commonProps} />;
    case 'image':
      return <FileImageIcon {...commonProps} />;
    default:
      return <FileQuestion {...commonProps} />;
  }
}

function ListItem({ item, onItemClick, onDownloadClick }) {
  const isFolder = item.type === 'folder';
  return (
    <div className="group flex w-full items-center px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100">
      <div className="flex w-8 items-center justify-center">
        {isFolder ? (
          <FolderIcon className="h-5 w-5 text-blue-500" />
        ) : (
          <DocumentItemIcon type={item.document_type} />
        )}
      </div>
      <button
        onClick={() => onItemClick(item)}
        className="w-[50%] truncate pr-4 text-left font-medium"
        title={item.name || item.document_name}
      >
        {item.name || item.document_name}
      </button>
      <div className="w-[20%] text-sm text-gray-500">
        {item.updated_at && formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
      </div>
      <div className="w-[10%] text-sm text-gray-500">
        {!isFolder && typeof item.file_size === 'number' ? formatBytes(item.file_size) : '—'}
      </div>
      <div className="w-[10%] text-right">
        {item.allow_download && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100"
            onClick={() => onDownloadClick(item)}
            title={`Download "${item.name || item.document_name}"`}
          >
            <DownloadIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function DataroomViewer({ data, slug, viewId }) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [previewingDoc, setPreviewingDoc] = useState(null);

  const handleDownloadFolder = async (folder) => {
    toast.info(`Preparing to download "${folder.name}"...`);
    try {
      const response = await downloadDataroomFolder(slug, folder.id);

      const contentDisposition = response.headers['content-disposition'];
      let filename = `${folder.name}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch.length > 1) {
          filename = filenameMatch[1];
        }
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Successfully downloaded "${filename}".`);
    } catch (error) {
      console.error('Failed to download folder:', error);
      // Error toast is handled by the api interceptor
    }
  };

  const handleDownloadDocument = (doc) => {
    // This constructs a URL to the existing single-file download endpoint.
    const downloadUrl = `/api/v1/links/${slug}/download/?document_id=${doc.document_id}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    // The browser will handle the 'download' attribute for same-origin URLs.
    // The backend should set 'Content-Disposition' header for this to work robustly.
    link.setAttribute('download', doc.document_name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownloadClick = (item) => {
    if (item.type === 'folder') {
      handleDownloadFolder(item);
    } else {
      handleDownloadDocument(item);
    }
  };

  const allItems = useMemo(() => [
    ...data.folders.map(f => ({ ...f, type: 'folder' })),
    ...data.documents.map(d => ({ ...d, type: 'document' })),
  ], [data.folders, data.documents]);

  const itemsById = useMemo(() => {
    const map = new Map();
    allItems.forEach(item => map.set(item.id, item));
    return map;
  }, [allItems]);

  const currentFolder = useMemo(() => {
    return currentFolderId ? itemsById.get(currentFolderId) : null;
  }, [currentFolderId, itemsById]);

  const itemsInCurrentFolder = useMemo(() => {
    return allItems.filter(item => (item.parent || null) === currentFolderId);
  }, [allItems, currentFolderId]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];
    let folder = currentFolder;
    while (folder) {
      crumbs.unshift(folder);
      folder = folder.parent ? itemsById.get(folder.parent) : null;
    }
    return crumbs;
  }, [currentFolder, itemsById]);

  const handleItemClick = (item) => {
    if (item.type === 'folder') {
      if (viewId) {
        // Fire-and-forget request to record the visit
        recordDataroomVisit(viewId, { dataroomFolderId: item.id }).catch((err) => {
          console.error('Failed to record folder visit:', err);
        });
      }
      setCurrentFolderId(item.id);
    } else {
      if (viewId) {
        // Fire-and-forget request to record the visit
        recordDataroomVisit(viewId, { dataroomDocumentId: item.id }).catch((err) => {
          console.error('Failed to record document visit:', err);
        });
      }
      setPreviewingDoc(item);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50">
      <header className="flex flex-shrink-0 items-center justify-between border-b bg-white p-4">
        <h1 className="text-xl font-semibold">{data.name}</h1>
        <a href="/" className="flex items-center gap-2 rounded-md p-2 font-semibold">
          <img src="/logo.svg" alt="Coneshare logo" className="h-6 w-6" />
          <span>Coneshare</span>
        </a>
      </header>

      <nav className="flex-shrink-0 border-b bg-white px-4 py-2">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <button
              onClick={() => setCurrentFolderId(null)}
              className="flex items-center gap-2 hover:text-gray-900"
            >
              <HomeIcon className="h-4 w-4" />
              <span>Root</span>
            </button>
          </li>
          {breadcrumbs.map(crumb => (
            <li key={crumb.id} className="flex items-center">
              <ChevronRight className="h-4 w-4 text-gray-400" />
              <button
                onClick={() => setCurrentFolderId(crumb.id)}
                className="ml-2 hover:text-gray-900"
              >
                {crumb.name}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="flex-1 overflow-y-auto border-t">
        <div className="flex w-full items-center border-b bg-gray-50 px-4 py-2 text-xs font-medium uppercase text-gray-500">
          <div className="w-8" />
          <div className="w-[50%] pr-4">Name</div>
          <div className="w-[20%]">Last Modified</div>
          <div className="w-[10%]">File Size</div>
          <div className="w-[10%] text-right">Actions</div>
        </div>
        <div className="divide-y">
          {itemsInCurrentFolder.map((item) => (
            <ListItem
              key={item.id}
              item={item}
              onItemClick={handleItemClick}
              onDownloadClick={handleDownloadClick}
            />
          ))}
        </div>
        {itemsInCurrentFolder.length === 0 && (
          <div className="p-12 text-center text-gray-500">This folder is empty.</div>
        )}
      </main>

      <Dialog open={!!previewingDoc} onOpenChange={isOpen => !isOpen && setPreviewingDoc(null)}>
        <DialogContent className="h-[90vh] max-w-[90vw] overflow-y-auto p-0">
          {previewingDoc && (
            <DataroomDocumentPreview
              slug={slug}
              document={previewingDoc}
              onClose={() => setPreviewingDoc(null)}
              viewId={viewId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
