import { useState } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { requestShareLinkAccess, confirmShareLinkEmailAccess } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { AccessOwnerCard } from './AccessOwnerCard';
import { useBranding } from '../../contexts/BrandingProvider';
import { LanguagePicker } from '../common/LanguagePicker';

function LogoHeader({ brandLogoUrl, brandName }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center mb-8">
      <div className="flex items-center gap-2">
        <img src={brandLogoUrl} alt={`${brandName} Logo`} className="h-8 w-8 object-contain" />
        <span className="text-xl font-bold tracking-tight text-gray-900">{brandName}</span>
      </div>
      <p className="mt-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        {t('viewer.secureFileShare')}
      </p>
    </div>
  );
}

function OpenSourceFooter({ brandWebsiteUrl, brandName, termsUrl, privacyPolicyUrl }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
      <div className="flex items-center gap-3">
        <a
          href={brandWebsiteUrl || "https://www.coneshare.com/about"}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          {t('auth.aboutBrand', { brandName: brandName || 'Coneshare' })}
        </a>
        <span className="text-gray-300">&bull;</span>
        <a
          href={termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          {t('auth.terms')}
        </a>
        <span className="text-gray-300">&bull;</span>
        <a
          href={privacyPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-600 transition-colors"
        >
          {t('auth.privacy')}
        </a>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400/80">
        <span>
          {t('viewer.poweredBy')}{' '}
          <a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-300 font-semibold underline transition-colors">Coneshare</a>
        </span>
        <span className="text-gray-300 select-none">&bull;</span>
        <LanguagePicker />
      </div>
    </div>
  );
}

export function EmailForm({
  slug,
  onSuccess,
  publicMeta = null,
  requiresConfirmation = false,
  emailToConfirm = '',
  token = '',
}) {
  const { t } = useTranslation();
  const { brandName, brandLogoUrl, brandWebsiteUrl, termsUrl, privacyPolicyUrl } = useBranding();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [localRequiresConfirmation, setLocalRequiresConfirmation] = useState(requiresConfirmation);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await requestShareLinkAccess(slug, email);
      toast.success(response.data.message);
      
      if (response.data.verification_required) {
        setHasSubmitted(true); // Show "check your email" message
      } else {
        onSuccess(); // No verification needed, grant access immediately
      }
    } catch (err) {
      // Error is handled by the global interceptor's toast.
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      const response = await confirmShareLinkEmailAccess(slug, token);
      toast.success(response.data.message);
      onSuccess();
    } catch (err) {
      setIsLoading(false);
    }
  };

  if (localRequiresConfirmation && emailToConfirm) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg border border-gray-100/80 animate-fadeIn">
          <LogoHeader brandLogoUrl={brandLogoUrl} brandName={brandName} />

          {/* Section 2: Owner & Document Info */}
          <AccessOwnerCard publicMeta={publicMeta} />

          {/* Section 3: Verification Methods */}
          <p className="mb-6 text-left text-sm text-gray-500">
            {t('viewer.verifyingAccessAs')} <strong className="break-all text-gray-900">{emailToConfirm}</strong>.
          </p>
          <div className="space-y-4">
            <Button onClick={handleConfirm} size="lg" className="w-full active:scale-[0.98] transition-transform" disabled={isLoading}>
              {isLoading ? t('viewer.verifying') : t('viewer.continueToDocument')}
            </Button>
            <div className="text-center">
              <button
                onClick={() => setLocalRequiresConfirmation(false)}
                className="text-xs font-semibold text-blue-600 hover:underline"
                disabled={isLoading}
              >
                {t('viewer.useDifferentEmail')}
              </button>
            </div>
          </div>
        </div>

        <OpenSourceFooter brandWebsiteUrl={brandWebsiteUrl} brandName={brandName} termsUrl={termsUrl} privacyPolicyUrl={privacyPolicyUrl} />
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg border border-gray-100/80 animate-fadeIn">
          <LogoHeader brandLogoUrl={brandLogoUrl} brandName={brandName} />

          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">{t('viewer.checkYourEmail')}</h1>
          <p className="mb-6 text-sm text-gray-500 leading-relaxed">
            {t('viewer.emailSentNotice')} <strong className="text-gray-900">{email}</strong>. {t('viewer.clickLinkNotice')}
          </p>
        </div>

        <OpenSourceFooter brandWebsiteUrl={brandWebsiteUrl} brandName={brandName} termsUrl={termsUrl} privacyPolicyUrl={privacyPolicyUrl} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg border border-gray-100/80 animate-fadeIn">
        <LogoHeader brandLogoUrl={brandLogoUrl} brandName={brandName} />

        {/* Section 2: Owner & Document Info */}
        <AccessOwnerCard publicMeta={publicMeta} />

        {/* Section 3: Verification Methods */}
        <p className="mb-6 text-left text-sm text-gray-500">
          {t('viewer.emailVerificationSubtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-semibold text-gray-600">
              {t('auth.email')}
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                placeholder="you@company.com"
                autoFocus
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" className="w-full active:scale-[0.98] transition-transform" disabled={isLoading}>
              {isLoading ? t('auth.submitting') : t('viewer.continue')}
            </Button>
          </div>
        </form>
      </div>

      <OpenSourceFooter brandWebsiteUrl={brandWebsiteUrl} brandName={brandName} termsUrl={termsUrl} privacyPolicyUrl={privacyPolicyUrl} />
    </div>
  );
}
