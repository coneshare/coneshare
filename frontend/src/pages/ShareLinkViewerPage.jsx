import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FileDown, MessageCircle, Info, X, AlertTriangle } from 'lucide-react';
import { PasswordForm } from '../components/viewer/PasswordForm';
import { EmailForm } from '../components/viewer/EmailForm';
import { NDAForm } from '../components/viewer/NDAForm';
import { ViewerToolbar } from '../components/viewer/ViewerToolbar';
import { PreviewViewer } from '../components/documents/PreviewViewer';
import { PdfJsViewer } from '../components/documents/PdfJsViewer';
import { VideoViewer } from '../components/documents/VideoViewer';
import { DataroomViewer } from '../components/viewer/DataroomViewer';
import { QnAPanel } from '../components/viewer/QnAPanel';
import { printPdf, printImages } from '../lib/print';
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
import { useBranding } from '../contexts/BrandingProvider';
import { LanguagePicker } from '../components/common/LanguagePicker';
import { useTranslation } from 'react-i18next';

const PREVIEW_POLL_INTERVAL_MS = 3000;

function PreviewBanner({ onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    const cleanUrl = window.location.origin + window.location.pathname;
    if (!navigator.clipboard) {
      console.error('Clipboard API not available');
      return;
    }
    navigator.clipboard.writeText(cleanUrl)
      .then(() => {
        setCopied(true);
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
      });
  };

  return (
    <div className="fixed top-4 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 px-4 animate-fadeIn">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/95 p-3 shadow-lg backdrop-blur-sm dark:border-amber-900/50 dark:bg-amber-950/90">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Owner Preview Mode:</span> Authorization steps (such as passwords or email checks) are bypassed. To test the full recipient experience,{' '}
          <button
            onClick={handleCopy}
            className="font-semibold underline hover:text-amber-950 dark:hover:text-white"
          >
            {copied ? 'Copied!' : 'copy the clean link'}
          </button>{' '}
          and open it in an incognito window.
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-0.5 text-amber-800/60 hover:bg-amber-100 hover:text-amber-800 dark:text-amber-300/60 dark:hover:bg-amber-900/50 dark:hover:text-amber-300"
          title="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ShareLinkViewerPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const previewToken = searchParams.get('previewToken');
  const accessToken = searchParams.get('accessToken');
  const viewSessionIdFromUrl = searchParams.get('view_session_id');
  const dataroomVisitIdFromUrl = searchParams.get('dataroom_visit_id');
  const dataroomDocumentIdFromUrl = searchParams.get('dataroom_document_id');
  const parentIdFromUrl = searchParams.get('parent_id');
  const { brandName, brandLogoUrl, brandWebsiteUrl } = useBranding();

  const [showPreviewBanner, setShowPreviewBanner] = useState(true);
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
  const viewerComponentRef = useRef(null);

  // Document-specific state must be declared at the top level, before any conditional returns.
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Synchronize totalPages with viewData when it loads
  useEffect(() => {
    if (viewData) {
      setTotalPages(viewData.num_pages || (viewData.pages?.length || 1));
    }
  }, [viewData]);

  const handleDocumentLoad = useCallback(({ numPages }) => {
    setTotalPages(numPages);
  }, []);

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
  const handleFitWidth = () => setZoomLevel(1);
  const handlePageChange = (pageNumber) => {
    viewerComponentRef.current?.goToPage(pageNumber);
  };

  useEffect(() => {
    viewIdRef.current = viewId;
  }, [viewId]);

  useEffect(() => {
    viewDataRef.current = viewData;
  }, [viewData]);

  // Only reset layout & session state when switching between different share link slugs.
  // We intentionally exclude dataroomDocumentIdFromUrl here to prevent unmounting the
  // DataroomViewer and resetting the sidebar tree when navigating documents inside a dataroom.
  useEffect(() => {
    hasLoadedViewDataRef.current = false;
    setViewData(null);
    setViewId(null);
    viewIdRef.current = null;
    setCurrentPage(1);
  }, [slug]);

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
    if (viewData) {
      document.title = `${viewData.name} - ${brandName}`;
    } else if (publicMeta) {
      document.title = `${publicMeta.target_name} - ${brandName}`;
    }
  }, [viewData, publicMeta, brandName]);

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

      // If we are already viewing a dataroom (either on the root scope or after deep-linking
      // into a document), skip parent-level refetching. This delegates document fetching
      // to DataroomViewer's own scoped fetcher and avoids breaking the SPA layout context.
      const isAlreadyDataroom = viewDataRef.current && (
        viewDataRef.current.link_type === 'dataroom' ||
        Boolean(viewDataRef.current.dataroom_context)
      );
      if (isAlreadyDataroom) {
        setIsLoading(false);
        return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (viewerComponentRef.current?.seekBy) {
          viewerComponentRef.current.seekBy(15);
        } else {
          const nextPage = Math.min(currentPage + 1, totalPages);
          if (nextPage !== currentPage) {
            viewerComponentRef.current?.goToPage(nextPage);
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (viewerComponentRef.current?.seekBy) {
          viewerComponentRef.current.seekBy(-15);
        } else {
          const prevPage = Math.max(currentPage - 1, 1);
          if (prevPage !== currentPage) {
            viewerComponentRef.current?.goToPage(prevPage);
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(prev + 0.1, 3));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const handlePrint = () => {
    if (!viewData) return;

    if (viewData.preview_mode === 'client_pdf') {
      printPdf(viewData.pdf_preview_url);
    } else {
      if (viewData.link_settings?.allow_download && viewData.type === 'pdf') {
        printPdf(downloadUrl);
      } else {
        const imageUrls = viewData.pages?.map((p) => p.url) || [];
        printImages(imageUrls);
      }
    }
  };

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
        requiresConfirmation={error?.requiresConfirmation}
        emailToConfirm={error?.emailToConfirm}
        token={accessToken}
      />
    );
  }

  if (protectionType === 'nda') {
    return (
      <NDAForm
        slug={slug}
        onSuccess={(sessionId) => {
          if (sessionId) {
            setViewId(sessionId);
          }
          setRefetchTrigger((c) => c + 1);
        }}
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

  const isDataroom =
    publicMeta?.target_type === 'dataroom' ||
    viewData?.link_type === 'dataroom' ||
    Boolean(viewData?.dataroom_context);

  if (isDataroom && viewData) {
    return (
      <>
        {previewToken && showPreviewBanner && (
          <PreviewBanner onClose={() => setShowPreviewBanner(false)} />
        )}
        <DataroomViewer data={viewData} slug={slug} viewId={viewId} />
      </>
    );
  }

  // Document-specific state and handlers
  const PREVIEWABLE_TYPES = ['image', 'pdf', 'document', 'video'];
  const isPreviewable = viewData && PREVIEWABLE_TYPES.includes(viewData.type);
  const canDownload = Boolean(viewData?.link_settings?.allow_download);
  const isQnaEnabled = viewData?.link_settings?.enable_qna !== false;
  const isVideo = viewData && viewData.type === 'video';
  const isVideoReady = isVideo && viewData.preview_status === 'ready';
  const canRenderPages = hasRenderablePages(viewData);
  const showPreviewState = viewData && isPreviewable && !viewData.download_only && (
    isVideo ? !isVideoReady : (!canRenderPages && viewData.preview_mode !== 'client_pdf')
  );
  const qnaButtonLabel = (isQnaOpen
    ? t('qna.closeQna', { defaultValue: 'Close Q&A' })
    : t('qna.openQna', { defaultValue: 'Open Q&A' })) +
    (qnaThreadCount > 0 ? `, ${t('qna.threadsCount', { count: qnaThreadCount, defaultValue: `${qnaThreadCount} threads` })}` : '');

  let downloadUrl = `/api/v1/links/${slug}/download-file/`;
  if (dataroomDocumentIdFromUrl) {
    downloadUrl += `?dataroom_document_id=${dataroomDocumentIdFromUrl}`;
  }

  if (viewData && (viewData.download_only || !isPreviewable)) {
    const isWatermarkedVideoBlocked = viewData.type === 'video' && 
      viewData.link_settings?.enable_watermark && 
      viewData.download_only;

    return (
      <div className="relative h-screen w-screen bg-gray-50">
        {previewToken && showPreviewBanner && (
          <PreviewBanner onClose={() => setShowPreviewBanner(false)} />
        )}
        <div className="absolute left-6 top-4 z-10 flex flex-col gap-1 items-start">
          <a
            href={brandWebsiteUrl || "/"}
            target={brandWebsiteUrl ? "_blank" : undefined}
            rel={brandWebsiteUrl ? "noopener noreferrer" : undefined}
            className="flex items-center gap-2 rounded-md bg-white p-2 font-semibold shadow-sm"
          >
            <img src={brandLogoUrl} alt={`${brandName} logo`} className="h-6 w-6 object-contain" />
            <span>{brandName}</span>
          </a>
          <div className="pl-1 text-[9px] text-gray-400/80 bg-white/40 px-1 rounded backdrop-blur-xs select-none flex items-center gap-1.5">
            <span>{t('viewer.poweredBy')}{' '}<a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 hover:underline dark:text-gray-100 dark:hover:text-gray-300 transition-colors font-medium">Coneshare</a></span>
            <span className="text-gray-300 select-none">&bull;</span>
            <LanguagePicker />
          </div>
        </div>
        <div className="flex h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              {isWatermarkedVideoBlocked ? (
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              ) : (
                <FileDown className="h-6 w-6 text-gray-600" />
              )}
            </div>
            <h1 className="mb-1 text-xl font-bold text-gray-900" title={viewData.name}>
              {viewData.name}
            </h1>
            {viewData.file_size ? (
              <p className="mb-6 text-sm text-gray-500">{formatBytes(viewData.file_size)}</p>
            ) : null}
            <p className="mb-6 text-gray-700">
              {isWatermarkedVideoBlocked
                ? t('viewer.watermarkedVideoBlockedNotice')
                : t('viewer.previewNotAvailableNotice')}
            </p>
            {isWatermarkedVideoBlocked ? (
              <Button size="lg" className="w-full" disabled>
                {t('viewer.downloadRestricted')}
              </Button>
            ) : canDownload ? (
              <Button asChild size="lg" className="w-full">
                <a href={downloadUrl} download={viewData.name}>
                  {t('viewer.download')}
                </a>
              </Button>
            ) : (
              <>
                <Button size="lg" className="w-full" disabled>
                  {t('viewer.download')}
                </Button>
                <p className="mt-2 text-sm text-gray-500">
                  {t('viewer.downloadDisabledNotice')}
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
        {previewToken && showPreviewBanner && (
          <PreviewBanner onClose={() => setShowPreviewBanner(false)} />
        )}
        <div className="absolute left-6 top-4 z-10 flex flex-col gap-1 items-start">
          <a
            href={brandWebsiteUrl || "/"}
            target={brandWebsiteUrl ? "_blank" : undefined}
            rel={brandWebsiteUrl ? "noopener noreferrer" : undefined}
            className="flex items-center gap-2 rounded-md bg-white p-2 font-semibold shadow-sm"
          >
            <img src={brandLogoUrl} alt={`${brandName} logo`} className="h-6 w-6 object-contain" />
            <span>{brandName}</span>
          </a>
          <div className="pl-1 text-[9px] text-gray-400/80 bg-white/40 px-1 rounded backdrop-blur-xs select-none flex items-center gap-1.5">
            <span>{t('viewer.poweredBy')}{' '}<a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 hover:underline dark:text-gray-100 dark:hover:text-gray-300 transition-colors font-medium">Coneshare</a></span>
            <span className="text-gray-300 select-none">&bull;</span>
            <LanguagePicker />
          </div>
        </div>
        <PreviewStatePanel
          documentData={viewData}
          allowDownload={canDownload}
          downloadUrl={downloadUrl}
        />
        {isQnaEnabled && isPreviewFailed(viewData) && (
          <Button
            type="button"
            className="absolute bottom-6 right-6 z-20 h-12 rounded-full px-4 shadow-lg"
            onClick={() => setIsQnaOpen((current) => !current)}
            disabled={!viewId}
            aria-label={qnaButtonLabel}
            title={qnaButtonLabel}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="ml-2 font-semibold">{t('qna.title', { defaultValue: 'Q&A' })}</span>
          </Button>
        )}
        <QnAPanel
          open={isQnaEnabled && isQnaOpen}
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

  const isVideoMode = viewData?.preview_mode === 'video';

  return (
    <div
      ref={viewerRef}
      className={`relative h-screen w-screen transition-colors duration-300 ${isVideoMode ? 'bg-zinc-900' : 'bg-gray-50'} transition-[padding] duration-200 ${isQnaOpen ? 'lg:pr-[34rem] xl:pr-[38rem]' : ''}`}
    >
      {previewToken && showPreviewBanner && (
        <PreviewBanner onClose={() => setShowPreviewBanner(false)} />
      )}
      <div className="absolute left-6 top-4 z-10 flex flex-col gap-1 items-start">
        <a
          href={brandWebsiteUrl || "/"}
          target={brandWebsiteUrl ? "_blank" : undefined}
          rel={brandWebsiteUrl ? "noopener noreferrer" : undefined}
          className="flex items-center gap-2 rounded-md bg-white p-2 font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition-all duration-300"
        >
          <img src={brandLogoUrl} alt={`${brandName} logo`} className="h-6 w-6 object-contain" />
          <span>{brandName}</span>
        </a>
        <div className="pl-1 text-[9px] text-gray-400/80 bg-white/40 px-1 rounded backdrop-blur-xs select-none flex items-center gap-1.5">
          <span>{t('viewer.poweredBy')}{' '}<a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-gray-700 hover:underline dark:text-gray-100 dark:hover:text-gray-300 transition-colors font-medium">Coneshare</a></span>
          <span className="text-gray-300 select-none">&bull;</span>
          <LanguagePicker />
        </div>
      </div>
      {viewData && (
        <>
          {viewData.preview_mode !== 'video' && (
            <ViewerToolbar
              allowDownload={Boolean(viewData.link_settings?.allow_download)}
              downloadUrl={downloadUrl}
              downloadFileName={viewData.name}
              downloadDocumentId={dataroomDocumentIdFromUrl || null}
              onFullScreen={handleFullScreen}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              zoomLevel={zoomLevel}
              onFitWidth={handleFitWidth}
              onPageChange={handlePageChange}
              currentPage={currentPage}
              totalPages={totalPages}
              viewId={viewId}
              previewMode={viewData.preview_mode}
              onPrint={handlePrint}
            />
          )}
          {viewData.preview_mode === 'video' ? (
            <div className="flex h-full w-full items-center justify-center p-8">
              <VideoViewer
                ref={viewerComponentRef}
                videoUrl={viewData.video_preview_url}
                viewId={viewId}
                dataroomVisitId={dataroomVisitId}
                allowDownload={viewData.link_settings?.allow_download}
                downloadUrl={downloadUrl}
              />
            </div>
          ) : viewData.preview_mode === 'client_pdf' ? (
            <PdfJsViewer
              ref={viewerComponentRef}
              pdfUrl={viewData.pdf_preview_url}
              title={viewData.name}
              viewId={viewId}
              dataroomVisitId={dataroomVisitId}
              watermarkText={
                viewData.link_settings?.enable_watermark
                  ? (viewData.link_settings.resolved_watermark_text || viewData.link_settings.watermark_text || '')
                  : ''
              }
              zoomLevel={zoomLevel}
              onPageChange={setCurrentPage}
              onDocumentLoad={handleDocumentLoad}
              documentData={viewData}
            />
          ) : (
            <PreviewViewer
              ref={viewerComponentRef}
              documentData={viewData}
              zoomLevel={zoomLevel}
              onPageChange={setCurrentPage}
              viewId={viewId}
              dataroomVisitId={dataroomVisitId}
            />
          )}
          {isQnaEnabled && (
          <Button
            type="button"
            className={`absolute bottom-6 z-20 h-12 rounded-full px-4 shadow-lg transition-[right] duration-200 ${isQnaOpen ? 'right-6 lg:right-[35.5rem] xl:right-[39.5rem]' : 'right-6'}`}
            onClick={() => setIsQnaOpen((current) => !current)}
            disabled={!viewId}
            aria-label={qnaButtonLabel}
            title={qnaButtonLabel}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="ml-2 font-semibold">{t('qna.title', { defaultValue: 'Q&A' })}</span>
            {qnaThreadCount > 0 && (
              <span
                className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-primary"
                aria-hidden="true"
              >
                {qnaThreadCount}
              </span>
            )}
          </Button>
          )}
          <QnAPanel
            open={isQnaEnabled && isQnaOpen}
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
