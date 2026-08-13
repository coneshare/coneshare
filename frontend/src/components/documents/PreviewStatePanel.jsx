import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileDown, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { formatBytes } from '../../lib/formatters';
import { getLocalizedErrorMessage } from '../../utils/errorTranslator';

export function isPreviewPending(documentData) {
  return ['not_generated', 'processing'].includes(documentData?.preview_status);
}

export function isPreviewFailed(documentData) {
  return documentData?.preview_status === 'failed' || documentData?.render_status === 'failed';
}

export function hasRenderablePages(documentData) {
  return Array.isArray(documentData?.pages) && documentData.pages.length > 0;
}

export function PreviewStatePanel({
  documentData,
  allowDownload = true,
  downloadUrl = null,
  className = '',
  onRetry = null,
}) {
  const { t } = useTranslation();
  const isFailed = isPreviewFailed(documentData);
  const isPending = isPreviewPending(documentData);
  const title = isFailed ? t('viewer.previewUnavailable') : t('viewer.preparingPreview');
  const message = isFailed
    ? getLocalizedErrorMessage(documentData?.render_error || documentData?.render_message, 'viewer.previewCouldNotBeGenerated')
    : t('viewer.preparingPreviewNotice');
  const href = downloadUrl || documentData?.download_url;

  const [showStuckRetry, setShowStuckRetry] = useState(false);

  // Both isPending and preview_status are listed as deps intentionally:
  // the timer must reset whenever the status string changes (even between
  // two pending states), not just when the boolean flips.
  useEffect(() => {
    setShowStuckRetry(false);
    if (!isPending) {
      return;
    }
    const timer = setTimeout(() => {
      setShowStuckRetry(true);
    }, 60000); // Show retry if stuck for > 60s
    return () => clearTimeout(timer);
  }, [isPending, documentData?.preview_status]);

  return (
    <div className={`flex h-full min-h-80 items-center justify-center p-4 ${className}`}>
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          {isPending ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
          ) : isFailed ? (
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          ) : (
            <FileDown className="h-6 w-6 text-gray-600" />
          )}
        </div>
        <h1 className="mb-1 truncate text-xl font-bold text-gray-900" title={documentData?.name || title}>
          {title}
        </h1>
        {documentData?.name && (
          <p className="mb-2 truncate text-sm text-gray-500" title={documentData.name}>
            {documentData.name}
          </p>
        )}
        {documentData?.file_size ? (
          <p className="mb-4 text-sm text-gray-500">{formatBytes(documentData.file_size)}</p>
        ) : null}
        <p className="mb-6 text-gray-700">{message}</p>
        {onRetry && (isFailed || (isPending && showStuckRetry)) && (
          <div className="mb-6 -mt-2 text-sm text-gray-500">
            {t('viewer.havingTroubleViewing')}{' '}
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline focus:outline-none"
            >
              {t('viewer.retryGeneration')}
            </button>
          </div>
        )}
        {allowDownload && href ? (
          <Button asChild size="lg" className="w-full">
            <a href={href} download={documentData?.name}>
              {t('viewer.download')}
            </a>
          </Button>
        ) : (
          <>
            <Button size="lg" className="w-full" disabled>
              {t('viewer.download')}
            </Button>
            {!allowDownload && (
              <p className="mt-2 text-sm text-gray-500">
                {t('viewer.downloadDisabledNotice')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
