import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createShareLink,
  updateShareLink,
} from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/Sheet';
import { Switch } from '../ui/Switch';

export function LinkSheet({
  isOpen,
  onOpenChange,
  documentId,
  currentLink,
  onSuccess,
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!currentLink;

  useEffect(() => {
    if (isEditing) {
      setName(currentLink.name || '');
      setAllowDownload(currentLink.allow_download);
    } else {
      // Reset form for new link
      setName('');
      setAllowDownload(true);
    }
    // Always reset password fields on open to ensure security and correct logic
    setPassword('');
    setPasswordChanged(false);
  }, [currentLink, isEditing, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const linkData = {
      document: documentId,
      name,
      allow_download: allowDownload,
    };

    if (isEditing) {
      // For edits, only include the password in the payload if the user has changed it.
      // This prevents accidentally removing the password if the field is left blank.
      if (passwordChanged) {
        linkData.password = password;
      }
    } else {
      // For new links, always include the password field.
      // An empty string will correctly result in no password being set.
      linkData.password = password;
    }

    try {
      if (isEditing) {
        await updateShareLink(currentLink.id, linkData);
        toast.success('Link updated successfully.');
      } else {
        await createShareLink(linkData);
        toast.success('Link created successfully.');
      }

      onSuccess(); // Trigger data refresh
      onOpenChange(false); // Close the sheet
    } catch (error) {
      // Error toast is handled by the global interceptor,
      // but you could add more specific handling here if needed.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Link' : 'Create New Link'}</SheetTitle>
          <SheetDescription>
            Configure the settings for your share link below. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name (Optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 'Marketing Campaign Link'"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password (Optional)</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordChanged(true);
              }}
              placeholder={isEditing ? 'Leave blank to keep existing' : 'Enter a password'}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="allow-download" className="flex flex-col space-y-1">
              <span>Allow Download</span>
              <span className="text-sm font-normal text-muted-foreground">
                Allow viewers to download the original file.
              </span>
            </Label>
            <Switch
              id="allow-download"
              checked={allowDownload}
              onCheckedChange={setAllowDownload}
            />
          </div>
          <SheetFooter>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
