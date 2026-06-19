import { useEffect, useState } from 'react';
import { getDocumentPreviewData } from '../../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Skeleton } from '../ui/Skeleton';
import { PreviewViewer } from './PreviewViewer';
import {
  hasRenderablePages,
  isPreviewPending,
  PreviewStatePanel,
} from './PreviewStatePanel';
import { PdfJsViewer } from './PdfJsViewer';

const PREVIEW_POLL_INTERVAL_MS = 3000;

export function DocumentPreviewModal({ documentId, isOpen, onOpenChange }) {
  const [documentData, setDocumentData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !documentId) {
      setDocumentData(null);
      return;
    }

    let isCancelled = false;

    let pollTimer = null;

    const fetchPreviewData = async ({ showLoading = false } = {}) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const response = await getDocumentPreviewData(documentId);
        if (!isCancelled) {
          setDocumentData(response.data);
          if (isPreviewPending(response.data)) {
            pollTimer = window.setTimeout(() => {
              fetchPreviewData();
            }, PREVIEW_POLL_INTERVAL_MS);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError('Failed to load document preview. Please try again.');
        }
        console.error(err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchPreviewData({ showLoading: true });

    return () => {
      isCancelled = true;
      window.clearTimeout(pollTimer);
    };
  }, [isOpen, documentId]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {documentData ? documentData.name : 'Document Preview'}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[calc(90vh-80px)] py-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}
          {error && <p className="text-center text-red-500">{error}</p>}
          {documentData && hasRenderablePages(documentData) && documentData.preview_mode !== 'client_pdf' && (
            <PreviewViewer
              documentData={documentData}
              zoomLevel={1}
              onPageChange={() => null}
            />
          )}
          {documentData && documentData.preview_mode === 'client_pdf' && (
            <PdfJsViewer pdfUrl={documentData.pdf_preview_url} title={documentData.name} />
          )}
          {documentData && !hasRenderablePages(documentData) && documentData.preview_mode !== 'client_pdf' && !error && (
            <PreviewStatePanel
              documentData={documentData}
              allowDownload={Boolean(documentData.download_url)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
