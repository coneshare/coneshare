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
import {
  hasRenderablePages,
  isPreviewFailed,
  isPreviewPending,
  PreviewStatePanel,
} from '../components/documents/PreviewStatePanel';
import {
  createViewSession,
  getPublicQnaSummary,
  getShareLinkPublicMeta,
  getShareLinkViewData,
} from '../services/api';
import { Button } from '../components/ui/Button';
import { formatBytes } from '../lib/formatters';

const PREVIEW_POLL_INTERVAL_MS = 3000;

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
  const [qnaThreadCount, setQnaThreadCount] = useState(0);
  const viewerRef = useRef(null);
  const hasLoadedViewDataRef = useRef(false);
  const viewIdRef = useRef(null);
  const viewDataRef = useRef(null);

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
    viewIdRef.current = viewId;
  }, [viewId]);

  useEffect(() => {
    viewDataRef.current = viewData;
  }, [viewData]);

  useEffect(() => {
    hasLoadedViewDataRef.current = false;
    setViewData(null);
    setViewId(null);
    viewIdRef.current = null;
    setCurrentPage(1);
  }, [slug, dataroomDocumentIdFromUrl]);

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
    let retryTimer = null;
    const fetchData = async () => {
      setIsLoading(!hasLoadedViewDataRef.current);
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
          } else if (!viewIdRef.current && response.data?.link_settings?.id) {
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
          const previousViewData = viewDataRef.current;
          const isBackgroundPreviewPoll =
            previousViewData &&
            previousViewData.link_type !== 'dataroom' &&
            isPreviewPending(previousViewData);

          if (isBackgroundPreviewPoll) {
            retryTimer = window.setTimeout(() => {
              setRefetchTrigger((current) => current + 1);
            }, PREVIEW_POLL_INTERVAL_MS);
            return;
          }

          const errorData =
            err.response?.data || { message: 'Failed to load document. The link may be invalid or expired.' };
          setError(errorData);

          if (err.response?.status === 401 && errorData?.protectionType) {
            setProtectionType(errorData.protectionType);
          }
        }
      } finally {
        if (!isCancelled) {
          hasLoadedViewDataRef.current = true;
          setIsLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isCancelled = true;
      window.clearTimeout(retryTimer);
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

  useEffect(() => {
    if (!viewData || viewData.link_type === 'dataroom' || !isPreviewPending(viewData)) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRefetchTrigger((current) => current + 1);
    }, PREVIEW_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [viewData]);

  useEffect(() => {
    let isCancelled = false;
    const fetchQnaThreadCount = async () => {
      if (!viewId || !viewData || viewData.link_type === 'dataroom') {
        setQnaThreadCount(0);
        return;
      }

      try {
        const response = await getPublicQnaSummary(slug, {
          viewSessionId: viewId,
          dataroomDocumentId: dataroomDocumentIdFromUrl || null,
        });
        if (!isCancelled) {
          setQnaThreadCount(response.data?.thread_count || 0);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load Q&A thread count:', error);
          setQnaThreadCount(0);
        }
      }
    };

    fetchQnaThreadCount();
    return () => {
      isCancelled = true;
    };
  }, [slug, viewId, viewData, dataroomDocumentIdFromUrl]);

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
  const canRenderPages = hasRenderablePages(viewData);
  const showPreviewState = viewData && isPreviewable && !viewData.download_only && !canRenderPages;
  const qnaButtonLabel = `${isQnaOpen ? 'Close Q&A' : 'Open Q&A'}${
    qnaThreadCount > 0 ? `, ${qnaThreadCount} threads` : ''
  }`;

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

  if (showPreviewState) {
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
        <PreviewStatePanel
          documentData={viewData}
          allowDownload={canDownload}
          downloadUrl={downloadUrl}
        />
        {isPreviewFailed(viewData) && (
          <Button
            type="button"
            className="absolute bottom-6 right-6 z-20 h-12 rounded-full px-4 shadow-lg"
            onClick={() => setIsQnaOpen((current) => !current)}
            disabled={!viewId}
            aria-label={qnaButtonLabel}
            title={qnaButtonLabel}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="ml-2 font-semibold">Q&amp;A</span>
          </Button>
        )}
        <QnAPanel
          open={isQnaOpen}
          onOpenChange={setIsQnaOpen}
          slug={slug}
          viewId={viewId}
          dataroomDocumentId={dataroomDocumentIdFromUrl || null}
          contextLabel={viewData.name}
          onThreadCountChange={setQnaThreadCount}
        />
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      className={`relative h-screen w-screen bg-gray-50 transition-[padding] duration-200 ${isQnaOpen ? 'lg:pr-[34rem] xl:pr-[38rem]' : ''}`}
    >
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
            className={`absolute bottom-6 z-20 h-12 rounded-full px-4 shadow-lg transition-[right] duration-200 ${isQnaOpen ? 'right-6 lg:right-[35.5rem] xl:right-[39.5rem]' : 'right-6'}`}
            onClick={() => setIsQnaOpen((current) => !current)}
            disabled={!viewId}
            aria-label={qnaButtonLabel}
            title={qnaButtonLabel}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="ml-2 font-semibold">Q&amp;A</span>
            {qnaThreadCount > 0 && (
              <span
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-primary"
                aria-hidden="true"
              >
                {qnaThreadCount}
              </span>
            )}
          </Button>
          <QnAPanel
            open={isQnaOpen}
            onOpenChange={setIsQnaOpen}
            slug={slug}
            viewId={viewId}
            dataroomDocumentId={dataroomDocumentIdFromUrl || null}
            contextLabel={viewData.name}
            onThreadCountChange={setQnaThreadCount}
          />
        </>
      )}
    </div>
  );
}
