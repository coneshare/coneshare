import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  createShareLink,
  updateShareLink,
  generateShareLinkPreview,
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
  const [allowDownload, setAllowDownload] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const isEditing = !!currentLink;

  useEffect(() => {
    if (isEditing) {
      setName(currentLink.name || '');
      setAllowDownload(currentLink.allow_download);
      // Don't pre-fill password for security
      setPassword('');
    } else {
      // Reset form for new link
      setName('');
      setPassword('');
      setAllowDownload(true);
    }
  }, [currentLink, isEditing, isOpen]);

  const handleSubmit = async (e, preview = false) => {
    e.preventDefault();
    setIsSaving(true);
    if (preview) {
      setIsPreviewing(true);
    }

    const linkData = {
      document: documentId,
      name,
      allow_download: allowDownload,
    };
    if (password) {
      linkData.password = password;
    }

    try {
      let savedLink;
      if (isEditing) {
        savedLink = await updateShareLink(currentLink.id, linkData);
        toast.success('Link updated successfully.');
      } else {
        savedLink = await createShareLink(linkData);
        toast.success('Link created successfully.');
      }

      if (preview) {
        const { data: { previewToken } } = await generateShareLinkPreview(savedLink.id);
        window.open(`/view/${savedLink.slug}?previewToken=${previewToken}`, '_blank');
      }

      onSuccess(); // Trigger data refresh
      onOpenChange(false); // Close the sheet
    } catch (error) {
      // Error toast is handled by the global interceptor,
      // but you could add more specific handling here if needed.
    } finally {
      setIsSaving(false);
      setIsPreviewing(false);
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
              onChange={(e) => setPassword(e.target.value)}
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
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e, true)}
              disabled={isSaving}
            >
              {isPreviewing ? 'Generating...' : 'Save & Preview'}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
