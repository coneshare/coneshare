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
  document,
  currentLink,
  onSuccess,
}) {
  const [name, setName] = useState('');
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [receiveEmailNotification, setReceiveEmailNotification] = useState(false);
  const [password, setPassword] = useState('');
  const [isPasswordEnabled, setIsPasswordEnabled] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!currentLink;
  const DUMMY_PASSWORD = '●●●●●●●●';
  const isWatermarkable = document?.type === 'pdf' || document?.type === 'document';

  useEffect(() => {
    if (isEditing) {
      setName(currentLink.name || '');
      setRequiresEmail(currentLink.requires_email || false);
      setRequiresEmailVerification(currentLink.requires_email_verification || false);
      setAllowDownload(currentLink.allow_download);
      setIsPasswordEnabled(currentLink.has_password);
      setPassword(currentLink.has_password ? DUMMY_PASSWORD : '');
      setExpiresAt(currentLink.expires_at ? new Date(currentLink.expires_at).toISOString().split('T')[0] : '');
      setReceiveEmailNotification(currentLink.receive_email_notification || false);
      setEnableWatermark(isWatermarkable && (currentLink.enable_watermark || false));
      setWatermarkText(currentLink.watermark_text || '');
    } else {
      // Reset form for new link
      setName('');
      setRequiresEmail(false);
      setRequiresEmailVerification(false);
      setAllowDownload(true);
      setIsPasswordEnabled(false);
      setPassword('');
      setExpiresAt('');
      setReceiveEmailNotification(false);
      setEnableWatermark(false);
      setWatermarkText('');
    }

    if (document?.download_only) {
      setAllowDownload(true);
    }
  }, [currentLink, document, isEditing, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const linkData = {
      document: document.id,
      name,
      requires_email: requiresEmail,
      requires_email_verification: requiresEmail && requiresEmailVerification,
      receive_email_notification: receiveEmailNotification,
      allow_download: allowDownload,
      enable_watermark: isWatermarkable && enableWatermark,
      watermark_text: isWatermarkable && enableWatermark ? watermarkText : '',
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null,
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
      <SheetContent className="sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Link' : 'Create New Link'}</SheetTitle>
          <SheetDescription>
            Configure the settings for your share link below. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <form id="link-sheet-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-6 py-6 pr-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name link</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., 'Marketing Campaign Link'"
            />
            {/* <p className="text-sm text-muted-foreground"> */}
            {/*   Organize link audiences to aggregate metrics. Leave blank to assign to a generic */}
            {/*   Example Account. This field is not visible to visitors. */}
            {/* </p> */}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="require-email" className="flex flex-col space-y-1">
                <span>Require email to view</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Viewers must enter their email address to view.
                </span>
              </Label>
              <Switch
                id="require-email"
                checked={requiresEmail}
                onCheckedChange={(checked) => {
                  setRequiresEmail(checked);
                  if (!checked) {
                    // If email is not required, verification must also be disabled.
                    setRequiresEmailVerification(false);
                  }
                }}
              />
            </div>
            {requiresEmail && (
              <div className="flex items-center justify-between rounded-md border bg-gray-50 p-4 dark:bg-gray-800/50">
                <Label htmlFor="verify-email" className="flex flex-col space-y-1">
                  <span>Verify email to view</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Viewers must click a link in an email to verify their identity.
                  </span>
                </Label>
                <Switch
                  id="verify-email"
                  checked={requiresEmailVerification}
                  onCheckedChange={setRequiresEmailVerification}
                />
              </div>
            )}
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
              {document?.download_only && (
                <span className="text-sm font-normal text-muted-foreground">
                  Download cannot be disabled for this file type.
                </span>
              )}
            </Label>
            <Switch
              id="allow-download"
              checked={allowDownload}
              onCheckedChange={setAllowDownload}
              disabled={document?.download_only}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="enable-watermark" className="flex flex-col space-y-1">
                <span>Enable watermark</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {isWatermarkable
                    ? 'Display a watermark on the document.'
                    : 'Watermarks are only available for PDF and Office documents.'}
                </span>
              </Label>
              <Switch
                id="enable-watermark"
                checked={enableWatermark}
                onCheckedChange={setEnableWatermark}
                disabled={!isWatermarkable}
              />
            </div>
            {isWatermarkable && enableWatermark && (
              <div className="space-y-2">
                <Input
                  id="watermark-text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="e.g., Confidential, {{ip-address}}"
                />
                <div className="flex items-center gap-2 pt-1">
                  <span
                    className="cursor-pointer rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                    onClick={() =>
                      setWatermarkText((prev) => (prev ? `${prev} {{ip-address}}` : '{{ip-address}}'))
                    }
                  >
                    {`{{ip-address}}`}
                  </span>
                  <span
                    className="cursor-pointer rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                    onClick={() =>
                      setWatermarkText((prev) => (prev ? `${prev} {{email}}` : '{{email}}'))
                    }
                  >
                    {`{{email}}`}
                  </span>
                </div>
              </div>
            )}            
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
          </div>
        </form>
        <SheetFooter>
          <Button type="submit" form="link-sheet-form" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
