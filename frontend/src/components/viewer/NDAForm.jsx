import { useState } from 'react';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { acceptShareLinkNda } from '../../services/api';
import { Button } from '../ui/Button';
import { AccessOwnerCard } from './AccessOwnerCard';
import { useBranding } from '../../contexts/BrandingProvider';
import { LanguagePicker } from '../common/LanguagePicker';

export function NDAForm({ slug, onSuccess, publicMeta = null }) {
  const { t } = useTranslation();
  const { brandName, brandLogoUrl, brandWebsiteUrl, termsUrl, privacyPolicyUrl } = useBranding();
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const ndaText = publicMeta?.nda_text || 'Non-Disclosure Agreement terms go here.';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreed) {
      toast.error('You must agree to the NDA terms to proceed.');
      return;
    }

    setIsLoading(true);
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const viewSessionId = searchParams.get('view_session_id');

      const response = await acceptShareLinkNda(slug, {
        view_session_id: viewSessionId,
      });

      toast.success('NDA accepted successfully.');
      onSuccess(response.data?.view_session_id);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to accept NDA. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-8 dark:bg-zinc-900">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg border border-gray-100/80 dark:bg-zinc-950 dark:border-zinc-800/80 animate-fadeIn">
        {/* Section 1: Logo */}
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="flex items-center gap-2">
            <img src={brandLogoUrl} alt={`${brandName} Logo`} className="h-8 w-8 object-contain" />
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{brandName}</span>
          </div>
          <p className="mt-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('viewer.secureFileShare')}
          </p>
        </div>

        {/* Section 2: Owner & Document Info */}
        <AccessOwnerCard publicMeta={publicMeta} />

        {/* Section 3: NDA Intro */}
        <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-indigo-50/50 p-3 text-xs text-indigo-800 border border-indigo-100/60 dark:bg-indigo-950/20 dark:text-indigo-300 dark:border-indigo-900/40">
          <FileText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <div className="leading-relaxed">
            <span className="font-semibold">{t('viewer.ndaRequired')}</span> {t('viewer.ndaNotice')}
          </div>
        </div>

        {/* Section 4: NDA Text Scroll Box */}
        <div className="mb-5 h-48 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-xs leading-relaxed text-gray-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 shadow-inner whitespace-pre-line break-words">
          {ndaText}
        </div>

        {/* Section 5: Form & Checkbox */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-offset-zinc-900"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={isLoading}
            />
            <span className="text-xs text-gray-600 dark:text-zinc-400 group-hover:text-gray-900 dark:group-hover:text-zinc-200 transition-colors leading-tight">
              {t('viewer.ndaAgreeCheckbox')}
            </span>
          </label>

          <div className="pt-1">
            <Button
              type="submit"
              size="lg"
              className="w-full active:scale-[0.98] transition-all bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              disabled={isLoading || !agreed}
            >
              {isLoading
                ? t('viewer.processing')
                : t('viewer.acceptAndView')}
            </Button>
          </div>
        </form>
      </div>

      {/* Footer Links */}
      <div className="mt-6 flex flex-col items-center justify-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
        <div className="flex items-center gap-3">
          <a
            href={brandWebsiteUrl || "https://www.coneshare.com/about"}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            {t('auth.aboutBrand', { brandName: brandName || 'Coneshare' })}
          </a>
          <span className="text-gray-300 dark:text-zinc-800">&bull;</span>
          <a
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            {t('auth.terms')}
          </a>
          <span className="text-gray-300 dark:text-zinc-800">&bull;</span>
          <a
            href={privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            {t('auth.privacy')}
          </a>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400/80 dark:text-zinc-600">
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
