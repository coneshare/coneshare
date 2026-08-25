import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Upload, X, Globe, Type, Image as ImageIcon, FileText, Shield, Loader2 } from 'lucide-react';
import { AdminNav } from '../components/admin/AdminNav';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Skeleton } from '../components/ui/Skeleton';
import { useBranding } from '../contexts/BrandingProvider';
import * as api from '../services/api';

export function AdminBrandingPage() {
  const { t } = useTranslation();
  const { refetchBranding } = useBranding();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Form states
  const [brandName, setBrandName] = useState('');
  const [brandWebsiteUrl, setBrandWebsiteUrl] = useState('');
  const [termsUrl, setTermsUrl] = useState('');
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');

  // Initial loaded states to check dirty state
  const [initialBrandName, setInitialBrandName] = useState('');
  const [initialBrandWebsiteUrl, setInitialBrandWebsiteUrl] = useState('');
  const [initialTermsUrl, setInitialTermsUrl] = useState('');
  const [initialPrivacyPolicyUrl, setInitialPrivacyPolicyUrl] = useState('');
  const [initialLogoUrl, setInitialLogoUrl] = useState('');

  const fileInputRef = useRef(null);

  const fetchBrandingData = async () => {
    setIsLoading(true);
    try {
      const response = await api.getAdminBranding();
      const org = response.data;
      setBrandName(org.brand_name || '');
      setBrandWebsiteUrl(org.brand_website_url || '');
      setTermsUrl(org.terms_url || '');
      setPrivacyPolicyUrl(org.privacy_policy_url || '');
      setLogoPreviewUrl(org.brand_logo_url || '');

      setInitialBrandName(org.brand_name || '');
      setInitialBrandWebsiteUrl(org.brand_website_url || '');
      setInitialTermsUrl(org.terms_url || '');
      setInitialPrivacyPolicyUrl(org.privacy_policy_url || '');
      setInitialLogoUrl(org.brand_logo_url || '');
    } catch (error) {
      console.error('Failed to load branding settings:', error);
      toast.error(t('admin.brandingLoadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBrandingData();
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl && logoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setLogoFile(file);
        setLogoPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setLogoFile(file);
        setLogoPreviewUrl(URL.createObjectURL(file));
      }
    }
  };

  const validateFile = (file) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      toast.error(t('admin.invalidFileType'));
      return false;
    }
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast.error(t('admin.fileTooLarge'));
      return false;
    }
    return true;
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreviewUrl(initialLogoUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isDirty =
    brandName !== initialBrandName ||
    brandWebsiteUrl !== initialBrandWebsiteUrl ||
    termsUrl !== initialTermsUrl ||
    privacyPolicyUrl !== initialPrivacyPolicyUrl ||
    logoFile !== null;

  const handleReset = () => {
    setBrandName(initialBrandName);
    setBrandWebsiteUrl(initialBrandWebsiteUrl);
    setTermsUrl(initialTermsUrl);
    setPrivacyPolicyUrl(initialPrivacyPolicyUrl);
    setLogoFile(null);
    setLogoPreviewUrl(initialLogoUrl);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData();
    formData.append('brand_name', brandName);
    formData.append('brand_website_url', brandWebsiteUrl);
    formData.append('terms_url', termsUrl);
    formData.append('privacy_policy_url', privacyPolicyUrl);
    if (logoFile) {
      formData.append('brand_logo', logoFile);
    }

    try {
      await api.updateAdminBranding(formData);
      toast.success(t('admin.brandingSaved'));
      
      // Update global context
      await refetchBranding();
      
      // Reload initial values to match current state
      await fetchBrandingData();
      setLogoFile(null);
    } catch (error) {
      console.error('Failed to save branding:', error);
      
      let errMsg = t('settings.settingsUpdateFailed');
      if (error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'object') {
          const messages = [];
          for (const [key, val] of Object.entries(data)) {
            const fieldName = key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
            if (Array.isArray(val)) {
              messages.push(`${fieldName}: ${val.join(' ')}`);
            } else if (typeof val === 'string') {
              messages.push(`${fieldName}: ${val}`);
            } else {
              messages.push(`${fieldName}: ${JSON.stringify(val)}`);
            }
          }
          if (messages.length > 0) {
            errMsg = messages.join(' ');
          }
        } else if (typeof data === 'string') {
          errMsg = data;
        }
      }
      
      toast.error(errMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <AdminNav />
      <div className="mb-6">
        <h2 className="text-2xl font-bold">{t('admin.brandingTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('admin.brandingSubtitle')}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Settings Form */}
          <form onSubmit={handleSave} className="space-y-6 lg:col-span-2 rounded-lg border bg-card p-6 shadow-sm">
            <div className="space-y-4">
              {/* Brand Name */}
              <div>
                <Label htmlFor="brandName" className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-muted-foreground" />
                  {t('admin.brandName')}
                </Label>
                <Input
                  id="brandName"
                  placeholder="e.g. Acme Corp Secure File Share"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  disabled={isSaving}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.brandNameHelp')}
                </p>
              </div>

              {/* Brand Website URL */}
              <div>
                <Label htmlFor="brandWebsiteUrl" className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {t('admin.brandWebsiteUrl')}
                </Label>
                <Input
                  id="brandWebsiteUrl"
                  type="url"
                  placeholder="https://acme.com"
                  value={brandWebsiteUrl}
                  onChange={(e) => setBrandWebsiteUrl(e.target.value)}
                  disabled={isSaving}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.brandWebsiteUrlHelp')}
                </p>
              </div>

              {/* Terms of Service URL */}
              <div>
                <Label htmlFor="termsUrl" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {t('admin.termsUrl')}
                </Label>
                <Input
                  id="termsUrl"
                  type="url"
                  placeholder="https://acme.com/terms"
                  value={termsUrl}
                  onChange={(e) => setTermsUrl(e.target.value)}
                  disabled={isSaving}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.termsUrlHelp')}
                </p>
              </div>

              {/* Privacy Policy URL */}
              <div>
                <Label htmlFor="privacyPolicyUrl" className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  {t('admin.privacyPolicyUrl')}
                </Label>
                <Input
                  id="privacyPolicyUrl"
                  type="url"
                  placeholder="https://acme.com/privacy"
                  value={privacyPolicyUrl}
                  onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
                  disabled={isSaving}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('admin.privacyPolicyUrlHelp')}
                </p>
              </div>

              {/* Logo File */}
              <div>
                <Label className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  {t('admin.brandLogo')}
                </Label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`mt-1.5 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/20 hover:border-primary/50'
                  }`}
                >
                  {logoFile ? (
                    <div className="flex flex-col items-center text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 mb-2">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {logoFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(logoFile.size / 1024).toFixed(1)} KB &bull; {t('admin.stagedForUpload')}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLogo();
                        }}
                        className="mt-3 text-xs text-red-600 hover:text-red-500 font-medium underline"
                      >
                        {t('common.remove')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground/80 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">{t('admin.clickToUpload')}</span> {t('admin.orDragAndDrop')}
                      </p>
                      <p className="text-xs text-muted-foreground/80 mt-1">
                        {t('admin.uploadLimits')}
                      </p>
                    </>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png, image/jpeg, image/svg+xml"
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!isDirty || isSaving}
              >
                {t('admin.reset')}
              </Button>
              <Button type="submit" disabled={!isDirty || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  t('common.save')
                )}
              </Button>
            </div>
          </form>

          {/* Preview Panel */}
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">{t('admin.preview')}</h3>
              
              {/* Logo Preview */}
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('admin.portalLogoPreview')}
                  </span>
                  <div className="mt-2 flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                    {logoPreviewUrl ? (
                      <div className="relative flex items-center gap-2">
                        <img
                          src={logoPreviewUrl}
                          alt="Logo Preview"
                          className="h-10 max-w-[120px] object-contain"
                        />
                        {logoFile && (
                          <button
                            type="button"
                            onClick={removeLogo}
                            className="absolute -top-2 -right-2 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow-sm hover:bg-destructive/90"
                            title="Remove uploaded logo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground text-xs font-semibold">
                        N/A
                      </div>
                    )}
                    <span className="font-semibold text-foreground text-sm">
                      {brandName || 'Coneshare'}
                    </span>
                  </div>
                </div>

                {/* Login Form Branding Mock */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('admin.signInPreview')}
                  </span>
                  <div className="mt-2 rounded-lg border bg-muted/10 p-6 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/40">
                      {logoPreviewUrl ? (
                        <img
                          src={logoPreviewUrl}
                          alt="Brand Logo"
                          className="h-6 w-6 object-contain"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                      )}
                    </div>
                    <h4 className="mt-3 text-sm font-semibold">
                      {t('auth.signIn')}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('auth.welcomeBack', { brandName: brandName || 'Coneshare' })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminBrandingPage;
