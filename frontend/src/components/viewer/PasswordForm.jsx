import { useState } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { verifyShareLinkPassword } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { AccessOwnerCard } from './AccessOwnerCard';
import { useBranding } from '../../contexts/BrandingProvider';
import { LanguagePicker } from '../common/LanguagePicker';

export function PasswordForm({ slug, onSuccess, publicMeta = null }) {
  const { t } = useTranslation();
  const { brandName, brandLogoUrl, brandWebsiteUrl, termsUrl, privacyPolicyUrl } = useBranding();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await verifyShareLinkPassword(slug, password);
      toast.success(t('viewer.accessGrantedLoading', { defaultValue: 'Access granted. Loading document...' }));
      onSuccess(); // Notify parent to refetch data
    } catch (err) {
      // Error is handled by the global interceptor's toast.
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg border border-gray-100/80 animate-fadeIn">
        {/* Section 1: Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <img src={brandLogoUrl} alt={`${brandName} Logo`} className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold tracking-tight text-gray-900">{brandName}</span>
          </div>
          <p className="mt-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('viewer.secureFileShare')}
          </p>
        </div>

        {/* Section 2: Owner & Document Info */}
        <AccessOwnerCard publicMeta={publicMeta} />

        {/* Section 3: Verification Methods */}
        <p className="mb-6 text-left text-sm text-gray-500">
          {t('viewer.passwordSubtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-semibold text-gray-600">
              {t('auth.password')}
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                placeholder={t('viewer.enterPassword')}
                autoFocus
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" size="lg" className="w-full active:scale-[0.98] transition-transform" disabled={isLoading}>
              {isLoading ? t('viewer.verifying') : t('viewer.unlockDocument')}
            </Button>
          </div>
        </form>
      </div>

      {/* Footer Links */}
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
    </div>
  );
}
