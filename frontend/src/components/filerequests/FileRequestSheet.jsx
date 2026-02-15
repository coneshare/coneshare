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
import { FolderBrowser } from '../documents/FolderBrowser';
import {
  createFileRequest,
  updateFileRequest,
  getRootFolderId,
} from '../../services/api';

export function FileRequestSheet({ isOpen, onOpenChange, folder, currentRequest, onSuccess }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxFileSize, setMaxFileSize] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!currentRequest;

  // State for folder browser
  const [destinationFolder, setDestinationFolder] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        const expiresAtValue = currentRequest.expires_at
          ? new Date(currentRequest.expires_at).toISOString().slice(0, 16)
          : '';
        setName(currentRequest.name || '');
        setMessage(currentRequest.message || '');
        setExpiresAt(expiresAtValue);
        setMaxFileSize(currentRequest.max_file_size ? String(currentRequest.max_file_size / (1024 * 1024)) : '');
      } else {
        // Reset for create mode
        setName('');
        setMessage('');
        setExpiresAt('');
        setMaxFileSize('');
        setDestinationFolder(folder || null);
      }
    }
  }, [isOpen, isEditing, currentRequest, folder]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const folderId = destinationFolder?.id || (await getRootFolderId()).data.id;

      const payload = {
        name,
        message,
        folder: folderId,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_file_size: maxFileSize ? parseInt(maxFileSize, 10) * 1024 * 1024 : null,
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
  
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit File Request' : 'Create File Request'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? `Editing file request for folder "${currentRequest.folder_name}".`
              : 'Create a link to request files. Select a destination folder and set your options.'}
          </SheetDescription>
        </SheetHeader>
        <form id="file-request-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-4 py-4 pr-6">
            <div className="space-y-2">
              <Label>Destination Folder</Label>
            <FolderBrowser
              initialFolderId={isEditing ? currentRequest.folder : (folder?.id || null)}
              onCurrentFolderChange={setDestinationFolder}
            />
          </div>

          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q1 Financials from Client"
            />
          </div>
          <div>
            <Label htmlFor="message">Message (Optional)</Label>
            <Input
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g., A short message to display on the upload page"
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
            <Label htmlFor="max_file_size">Max File Size (MB, Optional)</Label>
            <Input
              id="max_file_size"
              type="number"
              value={maxFileSize}
              onChange={(e) => setMaxFileSize(e.target.value)}
              placeholder="e.g., 10 for 10MB"
            />
          </div>
          </div>
        </form>
        <SheetFooter>
          <Button type="submit" form="file-request-form" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Link'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
