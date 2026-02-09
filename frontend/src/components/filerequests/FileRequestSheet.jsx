import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import {
  createFileRequest,
  updateFileRequest,
  getRootFolderId,
  getRootFolderContents,
} from '../../services/api';

export function FileRequestSheet({ isOpen, onOpenChange, folder, currentRequest, onSuccess }) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxFileSize, setMaxFileSize] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!currentRequest;

  // State for folder selection in create mode
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        const expiresAtValue = currentRequest.expires_at
          ? new Date(currentRequest.expires_at).toISOString().slice(0, 16)
          : '';
        setName(currentRequest.name || '');
        setExpiresAt(expiresAtValue);
        setMaxFileSize(currentRequest.max_file_size || '');
        // When editing, the folder is fixed, so no need to fetch folders.
        setSelectedFolderId(currentRequest.folder);
      } else {
        // Reset for create mode
        setName('');
        setExpiresAt('');
        setMaxFileSize('');
        setSelectedFolderId('');
        // If a folder is passed (e.g., from DocumentsPage), use it.
        if (folder) {
          setSelectedFolderId(folder.id);
        } else {
          // Otherwise, fetch folders for the dropdown.
          const fetchFolders = async () => {
            setIsLoadingFolders(true);
            try {
              const [rootRes, contentsRes] = await Promise.all([
                getRootFolderId(),
                getRootFolderContents(),
              ]);
              const rootFolder = { id: rootRes.data.id, name: 'Root Folder' };
              setFolders([rootFolder, ...contentsRes.data.sub_folders]);
              setSelectedFolderId(rootFolder.id); // Default to root
            } catch (error) {
              toast.error('Could not load folders for selection.');
            } finally {
              setIsLoadingFolders(false);
            }
          };
          fetchFolders();
        }
      }
    }
  }, [isOpen, isEditing, currentRequest, folder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name,
        folder: folder ? folder.id : selectedFolderId,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_file_size: maxFileSize ? parseInt(maxFileSize, 10) : null,
      };

      if (isEditing) {
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

  const isSubmitDisabled = isSubmitting || (!folder && !selectedFolderId);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit File Request' : 'Create File Request'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the details for your file request.'
              : 'Create a link to request files. Select a destination folder and set your options.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {!isEditing && !folder && (
            <div>
              <Label htmlFor="folder-select">Destination Folder</Label>
              <select
                id="folder-select"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                disabled={isLoadingFolders}
                className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingFolders ? (
                  <option>Loading folders...</option>
                ) : (
                  folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))
                )}
              </select>
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
            <Button type="submit" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
