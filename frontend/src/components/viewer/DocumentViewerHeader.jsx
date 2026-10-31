import { MessageCircle, Lock, ShieldCheck, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/Avatar';
import { LanguagePicker } from '../common/LanguagePicker';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function DocumentViewerHeader({
  documentName,
  brandName,
  brandLogoUrl,
  brandWebsiteUrl,
  ownerName,
  ownerAvatarUrl,
  isQnaEnabled = false,
  isQnaOpen = false,
  onToggleQna,
  qnaButtonLabel = 'Q&A',
  qnaText = null,
  qnaThreadCount = 0,
  hasViewSession = false,
  isWatermarked = false,
  isNdaProtected = false,
  isDownloadAllAllowed = false,
  isDownloadingAll = false,
  onDownloadAll,
  downloadAllButtonLabel = 'Download all',
}) {
  const { t } = useTranslation();
  const resolvedQnaText = qnaText ?? t('qna.title', { defaultValue: 'Q&A' });

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200/80 bg-white px-3 sm:px-6 shadow-xs z-20">
      {/* Left: Brand Logo & Powered By */}
      <div className="flex items-center gap-3 min-w-0">
        <a
          href={brandWebsiteUrl || "/"}
          target={brandWebsiteUrl ? "_blank" : undefined}
          rel={brandWebsiteUrl ? "noopener noreferrer" : undefined}
          className="flex items-center gap-2 rounded-md font-semibold hover:opacity-80 transition-opacity"
          style={{ color: 'var(--viewer-primary, #111827)' }}
        >
          {brandLogoUrl && (
            <img src={brandLogoUrl} alt={`${brandName} logo`} className="h-6 w-6 object-contain" />
          )}
          <span className="truncate max-w-[120px] sm:max-w-[200px] text-sm sm:text-base">{brandName}</span>
        </a>

        <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-gray-200 text-[10px] text-gray-400 select-none">
          <span>
            {t('viewer.poweredBy')}{' '}
            <a
              href="https://github.com/coneshare/coneshare"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 hover:text-gray-700 hover:underline transition-colors"
            >
              Coneshare
            </a>
          </span>
        </div>
      </div>

      {/* Center: Document Title & Security Capsule */}
      {documentName && (
        <div className="mx-2 sm:mx-4 flex-1 min-w-0 max-w-xs sm:max-w-md md:max-w-lg lg:max-w-xl flex items-center justify-center gap-2">
          <h1
            className="truncate text-xs sm:text-sm font-medium"
            style={{ color: 'var(--viewer-primary, #374151)' }}
            title={documentName}
          >
            {documentName}
          </h1>
          {isWatermarked && (
            <span
              data-testid="header-watermarked-badge"
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200/60 dark:border-zinc-700/60 text-[11px] font-medium shrink-0"
              title={t('viewer.confidentialWatermarked', { defaultValue: 'Confidential · Watermarked' })}
            >
              <Lock className="h-3 w-3 text-gray-500 dark:text-gray-400" />
              <span>{t('viewer.confidentialWatermarked', { defaultValue: 'Confidential · Watermarked' })}</span>
            </span>
          )}
          {isNdaProtected && (
            <span
              data-testid="header-nda-badge"
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200/60 dark:border-zinc-700/60 text-[11px] font-medium shrink-0"
              title={t('viewer.ndaActive', { defaultValue: 'NDA Active' })}
            >
              <ShieldCheck className="h-3 w-3 text-gray-500 dark:text-gray-400" />
              <span>{t('viewer.ndaActive', { defaultValue: 'NDA Active' })}</span>
            </span>
          )}
        </div>
      )}

      {/* Right: Owner Avatar, Q&A Toggle, and LanguagePicker */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {ownerName && (
          <div
            className="hidden sm:flex items-center gap-2 py-1 px-2 rounded-full bg-gray-50 border border-gray-100"
            title={ownerName}
          >
            <Avatar className="h-5 w-5 ring-1 ring-gray-200">
              <AvatarImage src={ownerAvatarUrl || ''} alt={ownerName} />
              <AvatarFallback className="text-[10px]">{getInitials(ownerName)}</AvatarFallback>
            </Avatar>
            <span className="truncate max-w-[100px] text-xs text-gray-600 font-medium">
              {ownerName}
            </span>
          </div>
        )}

        {isDownloadAllAllowed && (
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs font-medium gap-1.5 shrink-0 rounded-lg bg-gray-950 hover:bg-gray-800 text-white shadow-xs transition-all"
            onClick={onDownloadAll}
            disabled={isDownloadingAll}
            aria-label={downloadAllButtonLabel}
            title={downloadAllButtonLabel}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{downloadAllButtonLabel}</span>
          </Button>
        )}

        {isQnaEnabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={isQnaOpen}
            className={`h-8 rounded-full px-2.5 text-xs transition-colors border-gray-200 ${
              isQnaOpen ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-700 hover:bg-gray-100'
            }`}
            onClick={onToggleQna}
            disabled={!hasViewSession}
            aria-label={qnaButtonLabel}
            title={qnaButtonLabel}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="ml-1.5 hidden font-semibold sm:inline">{resolvedQnaText}</span>
            {qnaThreadCount > 0 && (
              <span
                className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                aria-hidden="true"
              >
                {qnaThreadCount}
              </span>
            )}
          </Button>
        )}

        <div className="flex items-center">
          <LanguagePicker />
        </div>
      </div>
    </header>
  );
}
