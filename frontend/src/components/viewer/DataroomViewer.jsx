import { useState, useMemo } from 'react';
import {
  FolderIcon,
  HomeIcon,
  ChevronRight,
  FileImageIcon,
  FileTextIcon,
  FileQuestion,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DataroomDocumentPreview } from './DataroomDocumentPreview';
import { Dialog, DialogContent } from '../ui/Dialog';
import { Cone } from 'lucide-react';
import { formatBytes } from '../../lib/formatters';

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

function ListItem({ item, onItemClick }) {
  const isFolder = item.type === 'folder';
  return (
    <button
      onClick={() => onItemClick(item)}
      className="flex w-full items-center px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100"
    >
      <div className="flex w-8 items-center justify-center">
        {isFolder ? (
          <FolderIcon className="h-5 w-5 text-blue-500" />
        ) : (
          <DocumentItemIcon type={item.document_type} />
        )}
      </div>
      <div className="w-[60%] truncate pr-4 font-medium" title={item.name || item.document_name}>
        {item.name || item.document_name}
      </div>
      <div className="w-[20%] text-sm text-gray-500">
        {item.updated_at && formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
      </div>
      <div className="w-[10%] text-sm text-gray-500">
        {!isFolder && typeof item.file_size === 'number' ? formatBytes(item.file_size) : '—'}
      </div>
    </button>
  );
}

export function DataroomViewer({ data, slug }) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [previewingDoc, setPreviewingDoc] = useState(null);

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
      setCurrentFolderId(item.id);
    } else {
      setPreviewingDoc(item);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50">
      <header className="flex flex-shrink-0 items-center justify-between border-b bg-white p-4">
        <h1 className="text-xl font-semibold">{data.name}</h1>
        <a href="/" className="flex items-center gap-2 rounded-md p-2 font-semibold">
          <Cone className="h-6 w-6" />
          <span>ConeShare</span>
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
          <div className="w-[60%] pr-4">Name</div>
          <div className="w-[20%]">Last Modified</div>
          <div className="w-[10%]">File Size</div>
        </div>
        <div className="divide-y">
          {itemsInCurrentFolder.map((item) => (
            <ListItem key={item.id} item={item} onItemClick={handleItemClick} />
          ))}
        </div>
        {itemsInCurrentFolder.length === 0 && (
          <div className="p-12 text-center text-gray-500">This folder is empty.</div>
        )}
      </main>

      <Dialog open={!!previewingDoc} onOpenChange={isOpen => !isOpen && setPreviewingDoc(null)}>
        <DialogContent className="h-[90vh] max-w-[90vw] p-0">
          {previewingDoc && (
            <DataroomDocumentPreview
              slug={slug}
              document={previewingDoc}
              onClose={() => setPreviewingDoc(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
