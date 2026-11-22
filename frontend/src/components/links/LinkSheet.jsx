import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  createShareLink,
  updateShareLink,
} from '../../services/api';
import { Badge } from '../ui/Badge';
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
import { PasswordInput } from '../ui/PasswordInput';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

export function LinkSheet({
  isOpen,
  onOpenChange,
  document,
  dataroom,
  currentLink,
  onSuccess,
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [audienceMode, setAudienceMode] = useState('anyone');
  const [audienceEmailsText, setAudienceEmailsText] = useState('');
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [receiveEmailNotification, setReceiveEmailNotification] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [isPasswordEnabled, setIsPasswordEnabled] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [enableQna, setEnableQna] = useState(true);
  const [enableWatermark, setEnableWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [requireNda, setRequireNda] = useState(false);
  const [ndaText, setNdaText] = useState('');
  const [ndaError, setNdaError] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const isEditing = !!currentLink;
  const isWatermarkable = ['pdf', 'document', 'image'].includes(document?.type) || !!dataroom;
  const isQnaAvailable = dataroom ? dataroom.enable_qna !== false : true;
  const advancedActiveCount =
    (audienceMode === 'allowlist' ? 1 : 0) +
    (requireNda ? 1 : 0) +
    (isQnaAvailable && enableQna ? 1 : 0);
    
  useEffect(() => {
    if (isOpen) {
      if (isEditing) {
        const mode = currentLink.audience_mode || 'anyone';
        const nextEnableWatermark = isWatermarkable && (currentLink.enable_watermark || false);
        const nextEnableQna = currentLink.enable_qna !== false;
        const nextRequireNda = currentLink.require_nda || false;
        setName(currentLink.name || '');
        setAudienceMode(mode);
        setAudienceEmailsText(
          Array.isArray(currentLink.audience_emails) ? currentLink.audience_emails.join('\n') : ''
        );
        setRequiresEmail(mode === 'allowlist' ? true : (currentLink.requires_email || false));
        setRequiresEmailVerification(currentLink.requires_email_verification || false);
        setAllowDownload(currentLink.allow_download);
        setEnableQna(nextEnableQna);
        setIsPasswordEnabled(currentLink.has_password || currentLink.is_password_protected || false);
        setPassword(currentLink.password || '');
        setPasswordTouched(false);
        if (currentLink.expires_at) {
          const d = new Date(currentLink.expires_at);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          setExpiresAt(`${year}-${month}-${day}T${hours}:${minutes}`);
        } else {
          setExpiresAt('');
        }
        setReceiveEmailNotification(currentLink.receive_email_notification || false);
        setEnableWatermark(nextEnableWatermark);
        setWatermarkText(currentLink.watermark_text || '');
        setRequireNda(nextRequireNda);
        setNdaText(currentLink.nda_text || '');
        setNdaError('');
        setIsAdvancedOpen(mode === 'allowlist' || nextRequireNda);
      } else {
        setName('');
        setAudienceMode('anyone');
        setAudienceEmailsText('');
        setRequiresEmail(false);
        setRequiresEmailVerification(false);
        setAllowDownload(true);
        setEnableQna(true);
        setIsPasswordEnabled(false);
        setPassword('');
        setPasswordTouched(false);
        setExpiresAt('');
        setReceiveEmailNotification(false);
        setEnableWatermark(false);
        setWatermarkText('');
        setRequireNda(false);
        setNdaText('');
        setNdaError('');
        setIsAdvancedOpen(false);
      }
    }

    if (document?.download_only) {
      setAllowDownload(true);
    }
  }, [currentLink, document, dataroom, isEditing, isOpen, isQnaAvailable, isWatermarkable]);
    
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (requireNda && !ndaText.trim()) {
      setNdaError(t('linkSheet.ndaTermsRequired'));
      setIsAdvancedOpen(true);
      return;
    }
    setNdaError('');
    setIsSaving(true);
    
    const isAllowlist = audienceMode === 'allowlist';
    const parsedAudienceEmails = isAllowlist
      ? audienceEmailsText
          .split(/[\n,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

    const effectiveRequiresEmail = isAllowlist ? true : requiresEmail;

    const linkData = {
      name,
      audience_mode: audienceMode,
      audience_emails: parsedAudienceEmails,
      requires_email: effectiveRequiresEmail,
      requires_email_verification: effectiveRequiresEmail && requiresEmailVerification,
      receive_email_notification: receiveEmailNotification,
      allow_download: allowDownload,
      enable_watermark: isWatermarkable && enableWatermark,
      watermark_text: isWatermarkable && enableWatermark ? watermarkText : '',
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      require_nda: requireNda,
      nda_text: requireNda ? ndaText : '',
    };
    
    if (isQnaAvailable) {
      linkData.enable_qna = enableQna;
    }
    
    if (!isEditing) {
      if (dataroom) {
        linkData.dataroom = dataroom.id;
      } else {
        linkData.document = document.id;
      }
    }
    
    if (isPasswordEnabled) {
      if (!isEditing || passwordTouched) {
        linkData.password = password;
      }
    } else if (isEditing && (currentLink?.has_password || currentLink?.is_password_protected)) {
      linkData.password = '';
    }

    try {
      if (isEditing) {
        await updateShareLink(currentLink.id, linkData);
        toast.success(t('linkSheet.linkUpdated'));
      } else {
        await createShareLink(linkData);
        toast.success(t('linkSheet.linkCreated'));
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
          <SheetTitle>{isEditing ? t('linkSheet.editTitle') : t('linkSheet.createTitle')}</SheetTitle>
          <SheetDescription>
            {t('linkSheet.description')}
          </SheetDescription>
        </SheetHeader>
        <form id="link-sheet-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-6 py-6 pr-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('linkSheet.nameLabel')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('linkSheet.namePlaceholder')}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="require-email" className="flex flex-col space-y-1">
                <span>{t('linkSheet.requireEmail')}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {t('linkSheet.requireEmailSubtitle')}
                </span>
              </Label>
              <Switch
                id="require-email"
                checked={audienceMode === 'allowlist' ? true : requiresEmail}
                disabled={audienceMode === 'allowlist'}
                onCheckedChange={(checked) => {
                  if (audienceMode === 'allowlist') return;
                  setRequiresEmail(checked);
                  if (!checked) {
                    // If email is not required, verification must also be disabled.
                    setRequiresEmailVerification(false);
                  }
                }}
              />
            </div>
            {(requiresEmail || audienceMode === 'allowlist') && (
              <div className="space-y-2 rounded-md border bg-gray-50 p-4 dark:bg-gray-800/50">
                <div className="flex items-center justify-between">
                  <Label htmlFor="verify-email" className="flex flex-col space-y-1">
                    <span>{t('linkSheet.verifyEmail')}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {t('linkSheet.verifyEmailSubtitle')}
                    </span>
                  </Label>
                  <Switch
                    id="verify-email"
                    checked={requiresEmailVerification}
                    onCheckedChange={setRequiresEmailVerification}
                  />
                </div>
                {audienceMode === 'allowlist' && !requiresEmailVerification && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t('linkSheet.allowlistUnverifiedWarning')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="password-enabled" className="flex flex-col space-y-1">
              <span>{t('linkSheet.passwordProtection')}</span>
            </Label>
            <Switch
              id="password-enabled"
              checked={isPasswordEnabled}
              onCheckedChange={setIsPasswordEnabled}
            />
          </div>
          {isPasswordEnabled && (
            <div className="space-y-2">
              <Label htmlFor="password">{t('linkSheet.password')}</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordTouched(true);
                }}
                placeholder={t('linkSheet.passwordPlaceholder')}
                autoFocus
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="allow-download" className="flex flex-col space-y-1">
              <span>{t('linkSheet.allowDownload')}</span>
              {document?.download_only && (
                <span className="text-sm font-normal text-muted-foreground">
                  {t('linkSheet.downloadDisabledNote')}
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
                <span>{t('linkSheet.enableWatermark')}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {isWatermarkable
                    ? t('linkSheet.watermarkSubtitle')
                    : t('linkSheet.watermarkNotAvailable')}
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
                  placeholder={t('linkSheet.watermarkPlaceholder')}
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

          <div className="flex items-center justify-between">
            <Label htmlFor="email-notification" className="flex flex-col space-y-1">
              <span>{t('linkSheet.emailNotification')}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t('linkSheet.emailNotificationSubtitle')}
              </span>
            </Label>
            <Switch
              id="email-notification"
              checked={receiveEmailNotification}
              onCheckedChange={setReceiveEmailNotification}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expires-at">{t('linkSheet.expirationDate')}</Label>
            <Input
              id="expires-at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              {t('linkSheet.expirationSubtitle')}
            </p>
          </div>

          <div className="space-y-6 pt-1">
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-border" />
              <button
                type="button"
                aria-expanded={isAdvancedOpen}
                onClick={() => setIsAdvancedOpen((prev) => !prev)}
                className="mx-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <span>{t('linkSheet.advancedSettings')}</span>
                {advancedActiveCount > 0 && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                    {t('linkSheet.advancedActiveCount', { count: advancedActiveCount })}
                  </Badge>
                )}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    isAdvancedOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div className="flex-grow border-t border-border" />
            </div>

            {isAdvancedOpen && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="audience-mode" className="flex flex-col space-y-1">
                      <span>{t('linkSheet.audienceLabel')}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {t('linkSheet.audienceSubtitle')}
                      </span>
                    </Label>
                    <Select
                      id="audience-mode"
                      value={audienceMode}
                      onChange={(e) => {
                        const nextMode = e.target.value;
                        setAudienceMode(nextMode);
                        if (nextMode === 'allowlist') {
                          setRequiresEmail(true);
                          if (audienceMode !== 'allowlist') {
                            setRequiresEmailVerification(true);
                          }
                        }
                      }}
                    >
                      <option value="anyone">{t('linkSheet.audienceAnyone')}</option>
                      <option value="allowlist">{t('linkSheet.audienceAllowlist')}</option>
                    </Select>
                  </div>

                  {audienceMode === 'allowlist' && (
                    <div className="space-y-2 rounded-md border bg-gray-50 p-4 dark:bg-gray-800/50">
                      <Label htmlFor="audience-emails">{t('linkSheet.audienceEmailsLabel')}</Label>
                      <Textarea
                        id="audience-emails"
                        value={audienceEmailsText}
                        onChange={(e) => setAudienceEmailsText(e.target.value)}
                        placeholder={t('linkSheet.audienceEmailsPlaceholder')}
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('linkSheet.audienceEmailsHelper')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('linkSheet.allowlistRequiresEmailNote')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="nda-enabled" className="flex flex-col space-y-1">
                      <span>{t('linkSheet.requireNda')}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {t('linkSheet.requireNdaSubtitle')}
                      </span>
                    </Label>
                    <Switch
                      id="nda-enabled"
                      checked={requireNda}
                      onCheckedChange={(checked) => {
                        setRequireNda(checked);
                        if (!checked) {
                          setNdaError('');
                        }
                      }}
                    />
                  </div>
                  {requireNda && (
                    <div className="space-y-2">
                      <Label htmlFor="nda-text">{t('linkSheet.ndaTerms')}</Label>
                      <textarea
                        id="nda-text"
                        rows={4}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        value={ndaText}
                        onChange={(e) => {
                          setNdaText(e.target.value);
                          if (e.target.value.trim()) {
                            setNdaError('');
                          }
                        }}
                        placeholder={t('linkSheet.ndaTermsPlaceholder')}
                        required
                      />
                      {ndaError && (
                        <p role="alert" className="text-xs text-destructive">
                          {ndaError}
                        </p>
                      )}
                      {isEditing && currentLink?.require_nda && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {t('linkSheet.ndaWarning')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="enable-qna" className="flex flex-col space-y-1">
                    <span>{t('linkSheet.enableQna')}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {isQnaAvailable
                        ? t('linkSheet.qnaSubtitle')
                        : t('linkSheet.qnaDisabledForDataroom')}
                    </span>
                  </Label>
                  <Switch
                    id="enable-qna"
                    checked={isQnaAvailable && enableQna}
                    onCheckedChange={setEnableQna}
                    disabled={!isQnaAvailable}
                  />
                </div>
              </div>
            )}
          </div>
          </div>
        </form>
        <SheetFooter>
          <Button type="submit" form="link-sheet-form" disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
