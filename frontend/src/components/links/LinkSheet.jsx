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
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [receiveEmailNotification, setReceiveEmailNotification] = useState(false);
  const [password, setPassword] = useState('');
  const [isPasswordEnabled, setIsPasswordEnabled] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!currentLink;
  const DUMMY_PASSWORD = '●●●●●●●●';

  useEffect(() => {
    if (isEditing) {
      setName(currentLink.name || '');
      setRequiresEmailVerification(currentLink.requires_email_verification || false);
      setAllowDownload(currentLink.allow_download);
      setIsPasswordEnabled(currentLink.has_password);
      setPassword(currentLink.has_password ? DUMMY_PASSWORD : '');
      setExpiresAt(currentLink.expires_at ? new Date(currentLink.expires_at).toISOString().split('T')[0] : '');
    } else {
      // Reset form for new link
      setName('');
      setRequiresEmailVerification(false);
      setAllowDownload(true);
      setIsPasswordEnabled(false);
      setPassword('');
      setExpiresAt('');
    }
    // This is a UI-only placeholder for now
    setReceiveEmailNotification(false);
  }, [currentLink, isEditing, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const linkData = {
      document: documentId,
      name,
      requires_email_verification: requiresEmailVerification,
      allow_download: allowDownload,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    if (isEditing) {
      if (isPasswordEnabled) {
        // Only include password in payload if it has been changed from the dummy value.
        // This prevents accidental password changes. An empty string means removal.
        if (password !== DUMMY_PASSWORD) {
          linkData.password = password;
        }
      } else {
        // If the switch is off, explicitly remove the password.
        linkData.password = '';
      }
    } else { // Creating a new link
      if (isPasswordEnabled) {
        linkData.password = password;
      }
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
            <Label htmlFor="name">Name link</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 'Marketing Campaign Link'"
            />
            <p className="text-sm text-muted-foreground">
              Organize link audiences to aggregate metrics. Leave blank to assign to a generic
              Example Account. This field is not visible to visitors.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="require-email" className="flex flex-col space-y-1">
              <span>Require email to view</span>
              <span className="text-sm font-normal text-muted-foreground">
                Viewers must enter their email address to view.
              </span>
            </Label>
            <Switch
              id="require-email"
              checked={requiresEmailVerification}
              onCheckedChange={setRequiresEmailVerification}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="email-notification" className="flex flex-col space-y-1">
              <span>Receive email notification</span>
              <span className="text-sm font-normal text-muted-foreground">
                Get notified via email when someone views your content.
              </span>
            </Label>
            <Switch
              id="email-notification"
              checked={receiveEmailNotification}
              onCheckedChange={setReceiveEmailNotification}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="password-enabled" className="flex flex-col space-y-1">
              <span>Password protection</span>
            </Label>
            <Switch
              id="password-enabled"
              checked={isPasswordEnabled}
              onCheckedChange={setIsPasswordEnabled}
            />
          </div>
          {isPasswordEnabled && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isEditing && currentLink.has_password
                    ? 'Enter new password (blank to remove)'
                    : 'Enter a password'
                }
                autoFocus
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="allow-download" className="flex flex-col space-y-1">
              <span>Allow download</span>
            </Label>
            <Switch
              id="allow-download"
              checked={allowDownload}
              onCheckedChange={setAllowDownload}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires-at">Expiration date</Label>
            <Input
              id="expires-at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              Set a date after which the link will no longer be accessible.
            </p>
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
