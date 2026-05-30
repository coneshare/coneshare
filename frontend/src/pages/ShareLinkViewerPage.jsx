import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FileDown, MessageCircle } from 'lucide-react';
import { PasswordForm } from '../components/viewer/PasswordForm';
import { EmailForm } from '../components/viewer/EmailForm';
import { ViewerToolbar } from '../components/viewer/ViewerToolbar';
import { PreviewViewer } from '../components/documents/PreviewViewer';
import { DataroomViewer } from '../components/viewer/DataroomViewer';
import { QnAPanel } from '../components/viewer/QnAPanel';
import { Skeleton } from '../components/ui/Skeleton';
import { getShareLinkViewData, createViewSession, getShareLinkPublicMeta } from '../services/api';
import { Button } from '../components/ui/Button';
import { formatBytes } from '../lib/formatters';

export function ShareLinkViewerPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const previewToken = searchParams.get('previewToken');
  const accessToken = searchParams.get('accessToken');
  const viewSessionIdFromUrl = searchParams.get('view_session_id');
  const dataroomVisitIdFromUrl = searchParams.get('dataroom_visit_id');
  const dataroomDocumentIdFromUrl = searchParams.get('dataroom_document_id');
  const parentIdFromUrl = searchParams.get('parent_id');

  const [viewData, setViewData] = useState(null);
  const [publicMeta, setPublicMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [protectionType, setProtectionType] = useState(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [viewId, setViewId] = useState(null);
  const [dataroomVisitId, setDataroomVisitId] = useState(null);
  const [isQnaOpen, setIsQnaOpen] = useState(false);
  const viewerRef = useRef(null);

  // Document-specific state must be declared at the top level, before any conditional returns.
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);

  const handleFullScreen = () => {
    if (viewerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        viewerRef.current.requestFullscreen();
      }
    }
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));

  useEffect(() => {
    let isCancelled = false;

    const fetchPublicMeta = async () => {
      try {
        const response = await getShareLinkPublicMeta(slug);
        if (!isCancelled) {
          setPublicMeta(response.data);
        }
      } catch {
        if (!isCancelled) {
          setPublicMeta(null);
        }
      }
    };

    fetchPublicMeta();
    return () => {
      isCancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      setProtectionType(null);

      if (dataroomVisitIdFromUrl) {
        setDataroomVisitId(dataroomVisitIdFromUrl);
      }

      try {
        const response = await getShareLinkViewData(slug, {
          previewToken,
          accessToken,
          dataroomDocumentId: dataroomDocumentIdFromUrl,
          parentId: dataroomDocumentIdFromUrl ? null : parentIdFromUrl,
        });
        if (!isCancelled) {
          setViewData(response.data);
          if (viewSessionIdFromUrl) {
            // If a session ID is passed from the parent dataroom, use it.
            setViewId(viewSessionIdFromUrl);
          } else {
            // Otherwise, create a new session for this link.
            try {
              const viewResponse = await createViewSession({ share_link: response.data.link_settings.id });
              if (!isCancelled) {
                setViewId(viewResponse.data.id);
              }
            } catch (viewError) {
              console.error('Failed to create view session:', viewError);
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          const errorData =
            err.response?.data || { message: 'Failed to load document. The link may be invalid or expired.' };
          setError(errorData);

          if (err.response?.status === 401 && errorData?.protectionType) {
            setProtectionType(errorData.protectionType);
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isCancelled = true;
    };
  }, [
    slug,
    previewToken,
    accessToken,
    viewSessionIdFromUrl,
    dataroomVisitIdFromUrl,
    dataroomDocumentIdFromUrl,
    // Intentionally excluded:
    // `parentIdFromUrl` changes are handled by DataroomViewer scoped fetches
    // so we avoid full-page reload/flicker during folder navigation.
    refetchTrigger,
  ]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (protectionType === 'password') {
    return (
      <PasswordForm
        slug={slug}
        onSuccess={() => setRefetchTrigger((c) => c + 1)}
        publicMeta={publicMeta}
      />
    );
  }

  if (protectionType === 'email') {
    return (
      <EmailForm
        slug={slug}
        onSuccess={() => setRefetchTrigger((c) => c + 1)}
        publicMeta={publicMeta}
      />
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <h1 className="mb-4 text-2xl font-bold text-red-600">Error</h1>
          <p className="text-gray-700">{error.message}</p>
        </div>
      </div>
    );
  }

  if (viewData?.link_type === 'dataroom') {
    return <DataroomViewer data={viewData} slug={slug} viewId={viewId} />;
  }

  // Document-specific state and handlers
  const PREVIEWABLE_TYPES = ['image', 'pdf', 'document'];
  const isPreviewable = viewData && PREVIEWABLE_TYPES.includes(viewData.type);
  const canDownload = Boolean(viewData?.link_settings?.allow_download);

  let downloadUrl = `/api/v1/links/${slug}/download-file/`;
  if (dataroomDocumentIdFromUrl) {
    downloadUrl += `?dataroom_document_id=${dataroomDocumentIdFromUrl}`;
  }

  if (viewData && (viewData.download_only || !isPreviewable)) {
    return (
      <div className="relative h-screen w-screen bg-gray-50">
        <div className="absolute left-6 top-4 z-10">
          <a
            href="/"
            className="flex items-center gap-2 rounded-md bg-white p-2 font-semibold shadow-sm"
          >
            <img src="/logo.svg" alt="Coneshare logo" className="h-6 w-6" />
            <span>Coneshare</span>
          </a>
        </div>
        <div className="flex h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <FileDown className="h-6 w-6 text-gray-600" />
            </div>
            <h1 className="mb-1 text-xl font-bold text-gray-900" title={viewData.name}>
              {viewData.name}
            </h1>
            {viewData.file_size ? (
              <p className="mb-6 text-sm text-gray-500">{formatBytes(viewData.file_size)}</p>
            ) : null}
            <p className="mb-6 text-gray-700">
              This type of file is not available for online preview. Download the file and open it
              on your device.
            </p>
            {canDownload ? (
              <Button asChild size="lg" className="w-full">
                <a href={downloadUrl} download={viewData.name}>
                  Download
                </a>
              </Button>
            ) : (
              <>
                <Button size="lg" className="w-full" disabled>
                  Download
                </Button>
                <p className="mt-2 text-sm text-gray-500">
                  Download is disabled for this document by the link permissions.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={viewerRef} className="relative h-screen w-screen bg-gray-50">
      <div className="absolute left-6 top-4 z-10">
        <a
          href="/"
          className="flex items-center gap-2 rounded-md bg-white p-2 font-semibold shadow-sm"
        >
          <img src="/logo.svg" alt="Coneshare logo" className="h-6 w-6" />
          <span>Coneshare</span>
        </a>
      </div>
      {viewData && (
        <>
          <ViewerToolbar
            allowDownload={viewData.link_settings.allow_download}
            downloadUrl={downloadUrl}
            downloadFileName={viewData.name}
            downloadDocumentId={dataroomDocumentIdFromUrl || null}
            onFullScreen={handleFullScreen}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            currentPage={currentPage}
            totalPages={viewData.num_pages}
            viewId={viewId}
          />
          <PreviewViewer
            documentData={viewData}
            zoomLevel={zoomLevel}
            onPageChange={setCurrentPage}
            viewId={viewId}
            dataroomVisitId={dataroomVisitId}
          />
          <Button
            type="button"
            className="absolute bottom-6 right-6 z-20 h-12 rounded-full px-4 shadow-lg"
            onClick={() => setIsQnaOpen(true)}
            disabled={!viewId}
            aria-label="Open Q&A"
            title="Open Q&A"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="ml-2 font-semibold">Q&amp;A</span>
          </Button>
          <QnAPanel
            open={isQnaOpen}
            onOpenChange={setIsQnaOpen}
            slug={slug}
            viewId={viewId}
            dataroomDocumentId={dataroomDocumentIdFromUrl || null}
            contextLabel={viewData.name}
          />
        </>
      )}
    </div>
  );
}
