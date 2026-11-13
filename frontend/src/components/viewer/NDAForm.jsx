import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, ArrowRight, ExternalLink, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  acceptShareLinkNda,
  getShareLinkNdaDownloadUrl,
  getShareLinkNdaPreviewUrl,
} from '../../services/api';
import { getLocalizedErrorMessage } from '../../utils/errorTranslator';
import { Button } from '../ui/Button';
import { GateLayout } from './GateLayout';
import { SignatureCapturePad } from './SignatureCapturePad';
import { useBranding } from '../../contexts/BrandingProvider';
import { cn } from '../../lib/utils';

export function NDAForm({ slug, onSuccess, publicMeta = null }) {
  const { t } = useTranslation();
  const { brandWebsiteUrl } = useBranding();
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signedAcceptanceId, setSignedAcceptanceId] = useState(null);
  const [signedViewSessionId, setSignedViewSessionId] = useState(null);
  const [signatureState, setSignatureState] = useState({
    signature_type: 'draw',
    signature_data: '',
    isValidSignature: false,
    signer_name: '',
    signer_title: '',
    signer_company: '',
    signer_email: '',
  });

  const isPdfNda = publicMeta?.nda_type === 'pdf';
  const hasNdaText = Boolean(publicMeta?.nda_text && publicMeta.nda_text.trim());
  const hasNdaSource = isPdfNda ? Boolean(publicMeta?.nda_document_name) : hasNdaText;
  const ndaText = hasNdaText
    ? publicMeta.nda_text
    : t('viewer.ndaTermsUnavailable', {
        defaultValue: 'No Non-Disclosure Agreement terms are currently available.',
      });

  const versionString = publicMeta?.nda_version
    ? String(publicMeta.nda_version).startsWith('v')
      ? publicMeta.nda_version
      : `v${publicMeta.nda_version}`
    : null;

  const canSubmitPdfNda =
    isPdfNda &&
    hasNdaSource &&
    agreed &&
    Boolean((signatureState.signer_name || '').trim()) &&
    signatureState.isValidSignature;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasNdaSource) {
      return;
    }
    if (!agreed) {
      toast.error(t('viewer.mustAgreeNda'));
      return;
    }
    if (isPdfNda && !canSubmitPdfNda) {
      toast.error('Please enter your full name and provide a signature.');
      return;
    }

    setIsLoading(true);
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const viewSessionId = searchParams.get('view_session_id');

      const payload = isPdfNda
        ? {
            view_session_id: viewSessionId,
            signer_name: signatureState.signer_name.trim(),
            signer_title: (signatureState.signer_title || '').trim(),
            signer_company: (signatureState.signer_company || '').trim(),
            signer_email: (signatureState.signer_email || '').trim(),
            signature_type: signatureState.signature_type,
            signature_data: signatureState.signature_data,
          }
        : {
            view_session_id: viewSessionId,
          };

      const response = await acceptShareLinkNda(slug, payload);

      toast.success(getLocalizedErrorMessage(response.data?.message || 'NDA accepted successfully.'));
      if (isPdfNda && response.data?.has_executed_pdf) {
        setSignedAcceptanceId(response.data?.acceptance_id || null);
        setSignedViewSessionId(response.data?.view_session_id || null);
      } else {
        onSuccess(response.data?.view_session_id);
      }
    } catch (err) {
      toast.error(getLocalizedErrorMessage(err, 'viewer.ndaAcceptFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (signedAcceptanceId) {
    return (
      <GateLayout publicMeta={publicMeta} maxWidth="max-w-lg">
        <div className="space-y-4 pt-2 text-center">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            NDA Executed & Sealed
          </h3>
          <p className="text-xs text-gray-600 dark:text-zinc-400">
            Your signed PDF copy with the audit certificate is ready for your records.
          </p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
            <Button asChild variant="outline" size="sm">
              <a
                href={getShareLinkNdaDownloadUrl(slug, signedAcceptanceId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5"
              >
                <Download className="h-4 w-4" />
                <span>Download Executed PDF</span>
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onSuccess(signedViewSessionId)}
              className="flex items-center justify-center gap-1.5"
            >
              <span>Continue to Document</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </GateLayout>
    );
  }

  return (
    <GateLayout publicMeta={publicMeta} maxWidth={isPdfNda ? 'max-w-2xl' : 'max-w-lg'}>
      <div className="space-y-4 pt-1">
        {/* NDA Warning Banner */}
        <div className="flex items-start gap-2.5 rounded-lg bg-indigo-50/90 dark:bg-indigo-950/30 p-3 text-xs text-indigo-950 dark:text-indigo-200 border border-indigo-200/80 dark:border-indigo-900/50">
          <ShieldAlert className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-[11px] block uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
              {t('viewer.ndaRequired')}
            </span>
            {isPdfNda
              ? 'Please review the Confidentiality Agreement PDF and apply your signature to proceed.'
              : t('viewer.ndaNotice')}
          </div>
        </div>

        {/* Legal Agreement Viewer Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 dark:text-zinc-400 px-0.5">
            <span>
              {versionString
                ? t('viewer.confidentialityAgreementWithVersion', {
                    version: versionString,
                    defaultValue: `Confidentiality Agreement (${versionString})`,
                  })
                : t('viewer.confidentialityAgreement', {
                    defaultValue: 'Confidentiality & Non-Disclosure Agreement',
                  })}
            </span>
            {isPdfNda && publicMeta?.nda_document_name && (
              <a
                href={getShareLinkNdaPreviewUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <span>{publicMeta.nda_document_name}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {isPdfNda ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
              <iframe
                title="NDA PDF Preview"
                src={getShareLinkNdaPreviewUrl(slug)}
                className="h-64 w-full border-0"
              />
            </div>
          ) : (
            <div
              className={cn(
                'max-h-52 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 p-4 text-xs leading-relaxed shadow-inner nda-scroll whitespace-pre-line break-words',
                hasNdaText
                  ? 'text-gray-700 dark:text-zinc-300'
                  : 'text-amber-800 dark:text-amber-400/90 italic bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/70 dark:border-amber-900/40'
              )}
            >
              {ndaText}
            </div>
          )}
        </div>

        {/* Agreement Checkbox & Primary CTA */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {isPdfNda && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 p-3">
              <SignatureCapturePad
                showIdentityFields
                onChange={setSignatureState}
                disabled={isLoading}
              />
            </div>
          )}

          <label
            className={cn(
              'flex items-start gap-3 select-none group',
              hasNdaSource ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-offset-zinc-900 cursor-pointer disabled:cursor-not-allowed"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={isLoading || !hasNdaSource}
            />
            <span className="text-xs text-gray-600 dark:text-zinc-400 group-hover:text-gray-900 dark:group-hover:text-zinc-200 transition-colors leading-normal">
              {t('viewer.ndaAgreeCheckbox')}
            </span>
          </label>

          <div className="pt-1">
            <Button
              type="submit"
              size="lg"
              className="w-full flex items-center justify-center gap-2 active:scale-[0.98] transition-all bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              disabled={isLoading || !agreed || !hasNdaSource || (isPdfNda && !canSubmitPdfNda)}
            >
              <span>
                {isLoading
                  ? t('viewer.processing')
                  : isPdfNda
                    ? 'Sign & Accept NDA'
                    : t('viewer.acceptAndView')}
              </span>
              {!isLoading && <ArrowRight className="h-4 w-4 shrink-0" />}
            </Button>
          </div>
        </form>

        <div className="text-center pt-1">
          <a
            href={brandWebsiteUrl || 'https://www.coneshare.com'}
            className="text-[11px] text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            {t('viewer.declineNda', { defaultValue: 'Decline and leave' })}
          </a>
        </div>
      </div>
    </GateLayout>
  );
}
