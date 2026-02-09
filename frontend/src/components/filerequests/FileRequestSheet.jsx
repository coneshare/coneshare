import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Folder as FolderIcon, ChevronRight, Home, ArrowLeft } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Skeleton } from '../ui/Skeleton';
import {
  createFileRequest,
  updateFileRequest,
  getFolderContents,
  getRootFolderContents,
  getRootFolderId,
} from '../../services/api';

export function FileRequestSheet({ isOpen, onOpenChange, folder, currentRequest, onSuccess }) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxFileSize, setMaxFileSize] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!currentRequest;

  // State for folder browser
  const [browserCurrentFolder, setBrowserCurrentFolder] = useState(null);
  const [browserSubFolders, setBrowserSubFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const fetchFolders = useCallback(async (folderId) => {
    setLoadingFolders(true);
    try {
      const response = folderId
        ? await getFolderContents(folderId)
        : await getRootFolderContents();
      const { current_folder, sub_folders } = response.data;
      setBrowserCurrentFolder(current_folder);
      setBrowserSubFolders(sub_folders);
    } catch (error) {
      toast.error('Could not load folders for selection.');
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        const expiresAtValue = currentRequest.expires_at
          ? new Date(currentRequest.expires_at).toISOString().slice(0, 16)
          : '';
        setName(currentRequest.name || '');
        setExpiresAt(expiresAtValue);
        setMaxFileSize(currentRequest.max_file_size || '');
      } else {
        // Reset for create mode
        setName('');
        setExpiresAt('');
        setMaxFileSize('');
        fetchFolders(folder?.id || null); // Start at pre-selected folder or root
      }
    }
  }, [isOpen, isEditing, currentRequest, folder, fetchFolders]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name,
        folder: browserCurrentFolder?.id || (await getRootFolderId()).data.id,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_file_size: maxFileSize ? parseInt(maxFileSize, 10) : null,
      };

      if (isEditing) {
        payload.folder = currentRequest.folder; // Folder cannot be changed on edit
        await updateFileRequest(currentRequest.id, payload);
        toast.success('File request updated successfully.');
      } else {
        await createFileRequest(payload);
        toast.success('File request created successfully.');
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleFolderClick = (folderId) => fetchFolders(folderId);
  
  const handleBackClick = () => {
    if (browserCurrentFolder && browserCurrentFolder.ancestors && browserCurrentFolder.ancestors.length > 0) {
        const parentId = browserCurrentFolder.ancestors[browserCurrentFolder.ancestors.length - 1].id;
        fetchFolders(parentId);
    } else {
        fetchFolders(null); // Go to root
    }
  };

  const renderBreadcrumbs = () => (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-medium text-muted-foreground">
      <button
        type="button"
        onClick={() => fetchFolders(null)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        <Home className="h-4 w-4" />
        <span>Root</span>
      </button>
      {browserCurrentFolder?.ancestors?.map(ancestor => (
        <div key={ancestor.id} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
          <button
            type="button"
            onClick={() => fetchFolders(ancestor.id)}
            className="truncate hover:text-foreground"
          >
            {ancestor.name}
          </button>
        </div>
      ))}
      {browserCurrentFolder && browserCurrentFolder.name !== '__root__' && (
        <div className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
          <span className="font-semibold text-foreground">{browserCurrentFolder.name}</span>
        </div>
      )}
    </nav>
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit File Request' : 'Create File Request'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? `Editing file request for folder "${currentRequest.folder_name}".`
              : 'Create a link to request files. Select a destination folder and set your options.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {!isEditing && (
            <div className="space-y-2">
              <Label>Destination Folder</Label>
              {browserCurrentFolder && (
                <Button variant="ghost" size="sm" type="button" onClick={handleBackClick} className="flex w-full items-center justify-start gap-2 text-sm">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              <div className="rounded-md border bg-muted/50 p-2">
                {renderBreadcrumbs()}
              </div>
              <div className="h-48 overflow-y-auto rounded-md border p-2">
                {loadingFolders ? (
                  <div className="space-y-2 p-2">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : browserSubFolders.length > 0 ? (
                  browserSubFolders.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleFolderClick(f.id)}
                      className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-muted"
                    >
                      <FolderIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  ))
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No subfolders</p>
                )}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="name">Name (Optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q1 Financials from Client"
            />
          </div>
          <div>
            <Label htmlFor="expires_at">Expires At (Optional)</Label>
            <Input
              id="expires_at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="max_file_size">Max File Size (Bytes, Optional)</Label>
            <Input
              id="max_file_size"
              type="number"
              value={maxFileSize}
              onChange={(e) => setMaxFileSize(e.target.value)}
              placeholder="e.g., 10485760 for 10MB"
            />
          </div>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
