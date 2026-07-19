import { useEffect, useState, useRef, useCallback } from 'react';
import { getDocumentPreviewData, rebuildDocumentPreview } from '../../services/api';
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
import { VideoViewer } from './VideoViewer';
import { ViewerToolbar } from '../viewer/ViewerToolbar';
import { printPdf, printImages } from '../../lib/print';

const PREVIEW_POLL_INTERVAL_MS = 3000;

export function DocumentPreviewModal({ documentId, versionId = null, isOpen, onOpenChange }) {
  const [documentData, setDocumentData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Document states for preview navigation and zoom inside the modal
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rebuildTriggerCount, setRebuildTriggerCount] = useState(0);
  
  const handleRetry = () => {
    setRebuildTriggerCount((prev) => prev + 1);
  };

  const modalViewerRef = useRef(null);
  const viewerComponentRef = useRef(null);
  const lastLoadedDocRef = useRef(null);
  const lastTriggerCountRef = useRef(0);

  // Synchronize totalPages when documentData resolves
  useEffect(() => {
    if (documentData) {
      setTotalPages(documentData.num_pages || (documentData.pages?.length || 1));
    }
  }, [documentData]);

  const handleDocumentLoad = useCallback(({ numPages }) => {
    setTotalPages(numPages);
  }, []);

  useEffect(() => {
    if (!isOpen || !documentId) {
      setDocumentData(null);
      setCurrentPage(1);
      setZoomLevel(1);
      lastLoadedDocRef.current = null;
      setRebuildTriggerCount(0);
      return;
    }

    let isCancelled = false;
    let pollTimer = null;

    const fetchPreviewData = async ({ showLoading = false, triggerRebuild = false } = {}) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      try {
        if (triggerRebuild) {
          try {
            const rebuildResponse = await rebuildDocumentPreview(documentId, versionId);
            if (!isCancelled) {
              setDocumentData(rebuildResponse.data);
              if (isPreviewPending(rebuildResponse.data)) {
                pollTimer = window.setTimeout(() => {
                  fetchPreviewData();
                }, PREVIEW_POLL_INTERVAL_MS);
              }
            }
            return;
          } catch (err) {
            if (err.response?.status !== 409) {
              throw err;
            }
          }
        }
        const response = await getDocumentPreviewData(documentId, versionId);
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
          setError(err.response?.data?.detail || 'Failed to load document preview. Please try again.');
        }
        console.error(err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    const isSameContext = lastLoadedDocRef.current === `${documentId}-${versionId}`;
    if (!isSameContext) {
      setRebuildTriggerCount(0);
      lastTriggerCountRef.current = 0;
    }

    const hasNewRetry = rebuildTriggerCount > lastTriggerCountRef.current;

    if (isSameContext && !hasNewRetry) {
      lastTriggerCountRef.current = rebuildTriggerCount;
      return;
    }

    lastTriggerCountRef.current = rebuildTriggerCount;

    const shouldRebuild = hasNewRetry && isSameContext;

    fetchPreviewData({ showLoading: true, triggerRebuild: shouldRebuild });
    lastLoadedDocRef.current = `${documentId}-${versionId}`;

    return () => {
      isCancelled = true;
      window.clearTimeout(pollTimer);
    };
  }, [isOpen, documentId, versionId, rebuildTriggerCount]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));
  const handleFitWidth = () => setZoomLevel(1);
  
  const handlePageChange = (pageNumber) => {
    viewerComponentRef.current?.goToPage(pageNumber);
  };

  const handleFullScreen = () => {
    if (modalViewerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        modalViewerRef.current.requestFullscreen();
      }
    }
  };

  const handlePrint = () => {
    if (!documentData) return;

    if (documentData.preview_mode === 'client_pdf') {
      printPdf(documentData.pdf_preview_url);
    } else {
      if (documentData.download_url && documentData.type === 'pdf') {
        printPdf(documentData.download_url);
      } else {
        const imageUrls = documentData.pages?.map((p) => p.url) || [];
        printImages(imageUrls);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {documentData ? documentData.name : 'Document Preview'}
          </DialogTitle>
        </DialogHeader>
        <div ref={modalViewerRef} className="relative h-[calc(90vh-80px)] py-4 overflow-hidden">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}
          {error && <p className="text-center text-red-500">{error}</p>}
          {documentData && (hasRenderablePages(documentData) || documentData.preview_mode === 'client_pdf') && !isLoading && !error && (
            <ViewerToolbar
              allowDownload={Boolean(documentData.download_url)}
              downloadUrl={documentData.download_url}
              downloadFileName={documentData.name}
              onFullScreen={handleFullScreen}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              zoomLevel={zoomLevel}
              onFitWidth={handleFitWidth}
              onPageChange={handlePageChange}
              currentPage={currentPage}
              totalPages={totalPages}
              viewId={null}
              previewMode={documentData.preview_mode}
              onPrint={handlePrint}
            />
          )}

          {documentData && hasRenderablePages(documentData) && documentData.preview_mode !== 'client_pdf' && (
            <PreviewViewer
              ref={viewerComponentRef}
              documentData={documentData}
              zoomLevel={zoomLevel}
              onPageChange={setCurrentPage}
            />
          )}
          {documentData && documentData.preview_mode === 'client_pdf' && (
            <PdfJsViewer
              ref={viewerComponentRef}
              pdfUrl={documentData.pdf_preview_url}
              title={documentData.name}
              zoomLevel={zoomLevel}
              onPageChange={setCurrentPage}
              onDocumentLoad={handleDocumentLoad}
              documentData={documentData}
            />
          )}
          {documentData && documentData.preview_mode === 'video' && (
            <div className="flex h-full w-full items-center justify-center p-4 bg-zinc-900 rounded-xl">
              <VideoViewer
                ref={viewerComponentRef}
                videoUrl={documentData.video_preview_url}
                allowDownload={Boolean(documentData.download_url)}
                downloadUrl={documentData.download_url}
              />
            </div>
          )}
          {documentData && !hasRenderablePages(documentData) && documentData.preview_mode !== 'client_pdf' && documentData.preview_mode !== 'video' && !error && (
            <PreviewStatePanel
              documentData={documentData}
              allowDownload={Boolean(documentData.download_url)}
              onRetry={handleRetry}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
