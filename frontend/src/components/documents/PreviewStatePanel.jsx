import { AlertTriangle, FileDown, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { formatBytes } from '../../lib/formatters';

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
}) {
  const isFailed = isPreviewFailed(documentData);
  const isPending = isPreviewPending(documentData);
  const title = isFailed ? 'Preview unavailable' : 'Preparing document preview';
  const message = isFailed
    ? documentData?.render_error || 'The preview could not be generated.'
    : 'This may take a moment for large documents.';
  const href = downloadUrl || documentData?.download_url;

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
        {allowDownload && href ? (
          <Button asChild size="lg" className="w-full">
            <a href={href} download={documentData?.name}>
              Download
            </a>
          </Button>
        ) : (
          <>
            <Button size="lg" className="w-full" disabled>
              Download
            </Button>
            {!allowDownload && (
              <p className="mt-2 text-sm text-gray-500">
                Download is disabled for this document by the link permissions.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
