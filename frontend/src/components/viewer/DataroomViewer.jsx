import { useState, useMemo } from 'react';
import { FileIcon, FolderIcon, HomeIcon, ChevronRight } from 'lucide-react';
import { DataroomDocumentPreview } from './DataroomDocumentPreview';
import { Dialog, DialogContent } from '../ui/Dialog';
import { Cone } from 'lucide-react';

export function DataroomViewer({ data, slug }) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [previewingDoc, setPreviewingDoc] = useState(null);

  const itemsById = useMemo(() => {
    const map = new Map();
    data.folders.forEach(f => map.set(f.id, { ...f, type: 'folder' }));
    data.documents.forEach(d => map.set(d.id, { ...d, type: 'document' }));
    return map;
  }, [data.folders, data.documents]);

  const currentFolder = useMemo(() => {
    return currentFolderId ? itemsById.get(currentFolderId) : null;
  }, [currentFolderId, itemsById]);

  const itemsInCurrentFolder = useMemo(() => {
    const allItems = [...data.folders, ...data.documents];
    return allItems.filter(item => (item.parent || null) === currentFolderId);
  }, [data.folders, data.documents, currentFolderId]);

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

      <main className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {itemsInCurrentFolder.map(item => (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="flex items-center gap-3 rounded-md border bg-white p-3 text-left shadow-sm transition-colors hover:bg-gray-100"
            >
              {item.type === 'folder' ? (
                <FolderIcon className="h-6 w-6 flex-shrink-0 text-blue-500" />
              ) : (
                <FileIcon className="h-6 w-6 flex-shrink-0 text-gray-500" />
              )}
              <span className="truncate font-medium">{item.name || item.document_name}</span>
            </button>
          ))}
        </div>
        {itemsInCurrentFolder.length === 0 && (
          <div className="mt-8 text-center text-gray-500">This folder is empty.</div>
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
