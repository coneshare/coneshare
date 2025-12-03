import { useEffect, useState, useRef } from 'react';
import { getShareLinkViewData } from '../../services/api';
import { PreviewViewer } from '../documents/PreviewViewer';
import { ViewerToolbar } from './ViewerToolbar';
import { Skeleton } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { X } from 'lucide-react';

export function DataroomDocumentPreview({ slug, document: dataroomDoc, onClose, viewId, dataroomVisitId }) {
  const [documentData, setDocumentData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const viewerRef = useRef(null);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.5));

  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getShareLinkViewData(slug, { documentId: dataroomDoc.document_id });
        if (!isCancelled) {
          setDocumentData(response.data);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.response?.data || { message: 'Failed to load document.' });
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    if (slug && dataroomDoc) {
      fetchData();
    }

    return () => {
      isCancelled = true;
    };
  }, [slug, dataroomDoc]);

  const handleFullScreen = () => {
    if (viewerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        viewerRef.current.requestFullscreen();
      }
    }
  };

  if (isLoading) {
    return <Skeleton className="h-full w-full" />;
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600">Error</h2>
          <p className="mt-2 text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={viewerRef} className="relative h-full w-full bg-gray-50">
      {documentData && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-4 top-4 z-20 rounded-full bg-white shadow-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </Button>
          <ViewerToolbar
            allowDownload={documentData.link_settings.allow_download}
            downloadUrl={documentData.download_url}
            onFullScreen={handleFullScreen}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            currentPage={currentPage}
            totalPages={documentData.num_pages}
            viewId={viewId}
          />
          <PreviewViewer
            documentData={documentData}
            zoomLevel={zoomLevel}
            onPageChange={setCurrentPage}
            viewId={viewId}
            dataroomVisitId={dataroomVisitId}
          />
        </>
      )}
    </div>
  );
}
