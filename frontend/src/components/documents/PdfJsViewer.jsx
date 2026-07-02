/**
 * PdfJsViewer Component
 * 
 * Orchestrates the PDF viewing experience using pdfjs-dist.
 * Responsibilities:
 * 1. Hosts the scrollable layout container and watermark overlays.
 * 2. Manages zoom scaling and coordinates page-change events.
 * 3. Uses an IntersectionObserver (with no rootMargin and multiple thresholds)
 *    to detect which page is currently most visible in the viewport.
 * 4. Tracks active viewing duration per page, pausing during user inactivity
 *    or tab hiding, and reporting analytics to the backend via recordPageView.
 */

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { recordPageView } from '../../services/api';
import { usePdfDocument } from '../../hooks/usePdfDocument';
import { PdfPage } from './PdfPage';
import { Skeleton } from '../ui/Skeleton';
import { isSafeUrl } from '../../lib/utils';

export const PdfJsViewer = forwardRef(({
  pdfUrl,
  title = 'PDF Document',
  viewId,
  dataroomVisitId,
  watermarkText = '',
  zoomLevel = 1,
  onPageChange = () => {},
  onDocumentLoad = () => {},
  documentData = null,
}, ref) => {
  const { pdfDoc, numPages, pageDimensions, loading, error } = usePdfDocument(pdfUrl);

  const [scrollContainer, setScrollContainer] = useState(null);

  const pageRefs = useRef(new Map());
  const visibilityRatiosRef = useRef(new Map());
  const activePageRef = useRef(1);
  const timeOnPageRef = useRef(0);
  const intervalRef = useRef(null);
  const isInactiveRef = useRef(false);
  const inactivityTimerRef = useRef(null);

  // Notify parent of total pages once PDF is loaded client-side
  useEffect(() => {
    if (pdfDoc && numPages) {
      onDocumentLoad({ numPages });
    }
  }, [pdfDoc, numPages, onDocumentLoad]);

  const scrollContainerCallbackRef = useCallback((node) => {
    if (node !== null) {
      setScrollContainer(node);
    }
  }, []);

  const sendTrackingData = useCallback(
    (page, duration, useBeacon = false) => {
      if (!viewId || duration < 1) return;
      const payload = {
        view_session: viewId,
        page_number: page,
        duration_seconds: Math.round(duration),
      };
      if (dataroomVisitId) {
        payload.dataroom_visit = dataroomVisitId;
      }
      recordPageView(payload, useBeacon);
    },
    [viewId, dataroomVisitId]
  );

  // Expose goToPage via ref
  useImperativeHandle(ref, () => ({
    goToPage: (pageNumber) => {
      const pageEl = pageRefs.current.get(pageNumber);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }));

  // Active time tracking loop (only when active and visible)
  useEffect(() => {
    const tick = () => {
      if (!isInactiveRef.current && !document.hidden) {
        timeOnPageRef.current += 1;
      }
    };

    if (viewId) {
      intervalRef.current = setInterval(tick, 1000);
    }

    return () => {
      clearInterval(intervalRef.current);
      // Send final duration for the last active page when component unmounts
      sendTrackingData(activePageRef.current, timeOnPageRef.current);
      timeOnPageRef.current = 0;
    };
  }, [viewId, sendTrackingData]);

  // Inactivity detection (60 seconds)
  useEffect(() => {
    if (!viewId) return;

    const INACTIVITY_TIMEOUT = 60000;

    const handleActivity = () => {
      isInactiveRef.current = false;
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        isInactiveRef.current = true;
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousemove', 'keydown', 'scroll', 'mousedown'];
    events.forEach((event) => window.addEventListener(event, handleActivity));
    handleActivity();

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      clearTimeout(inactivityTimerRef.current);
    };
  }, [viewId]);

  // Flush remaining duration on window unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      sendTrackingData(activePageRef.current, timeOnPageRef.current, true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendTrackingData]);

  // Reset scroll and page state when a new document is loaded
  useEffect(() => {
    if (!scrollContainer || !pdfDoc) return;

    scrollContainer.scrollTop = 0;
    activePageRef.current = 1;
    timeOnPageRef.current = 0;
    visibilityRatiosRef.current.clear();
    onPageChange(1);
  }, [pdfDoc, onPageChange, scrollContainer]);

  // Page visibility IntersectionObserver to determine current active page
  useEffect(() => {
    if (!scrollContainer || !pdfDoc) return;

    visibilityRatiosRef.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNumber = parseInt(entry.target.dataset.pageNumber, 10);
          if (entry.isIntersecting) {
            visibilityRatiosRef.current.set(pageNumber, entry.intersectionRatio);
          } else {
            visibilityRatiosRef.current.delete(pageNumber);
          }
        });

        const visiblePages = [...visibilityRatiosRef.current.entries()];
        if (visiblePages.length > 0) {
          const [newPageNumber] = visiblePages.reduce((mostVisible, page) =>
            page[1] > mostVisible[1] ? page : mostVisible
          );
          if (newPageNumber !== activePageRef.current) {
            // Page has changed, send tracking data for the previous page
            sendTrackingData(activePageRef.current, timeOnPageRef.current);
            // Reset timer and update current page
            timeOnPageRef.current = 0;
            activePageRef.current = newPageNumber;
          }
          onPageChange(newPageNumber);
        }
      },
      {
        root: scrollContainer,
        threshold: [0.25, 0.5, 0.75],
      }
    );

    const refs = pageRefs.current;
    refs.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      refs.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
      observer.disconnect();
    };
  }, [numPages, pdfDoc, onPageChange, sendTrackingData, scrollContainer]);

  if (!pdfUrl) return null;

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col gap-4 p-8 bg-gray-100 dark:bg-gray-800">
        <Skeleton className="h-12 w-1/2 mx-auto" />
        <Skeleton className="h-[70vh] w-[600px] mx-auto rounded-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center text-red-500 bg-gray-100 dark:bg-gray-800 animate-fadeIn">
        <div>
          <p className="font-semibold text-lg">Failed to load preview</p>
          <p className="text-sm text-gray-500 mt-2">
            {error.message || 'An error occurred while loading the PDF document.'}
          </p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
          >
            Download the PDF
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Scrollable page container */}
      <div
        ref={scrollContainerCallbackRef}
        className="h-full overflow-y-auto bg-gray-100 dark:bg-gray-800"
      >
        <div className="mx-auto flex w-fit flex-col items-center space-y-4 p-4 pb-24">
          {Array.from({ length: numPages }, (_, i) => {
            const pageNumber = i + 1;
            const pageDim = pageDimensions[pageNumber - 1] || null;
            // O(1) Optimization: pages is typically sorted by page_number,
            // so the page we need is almost always at index pageNumber - 1.
            // We verify index match first to avoid expensive O(N^2) linear searches.
            const pageIndex = pageNumber - 1;
            const candidate = documentData?.pages?.[pageIndex];
            const pageData = (candidate && candidate.page_number === pageNumber)
              ? candidate
              : documentData?.pages?.find((p) => p.page_number === pageNumber);
            return (
              <div
                key={pageNumber}
                ref={(node) => {
                  if (node) {
                    pageRefs.current.set(pageNumber, node);
                  } else {
                    pageRefs.current.delete(pageNumber);
                  }
                }}
                data-page-number={pageNumber}
                className="relative w-fit mx-auto"
              >
                <PdfPage
                  pdfDoc={pdfDoc}
                  pageNumber={pageNumber}
                  scale={zoomLevel}
                  scrollContainer={scrollContainer}
                  dimensions={pageDim}
                />
                {pageData?.page_links?.links?.filter(link => isSafeUrl(link.url) && link.bbox).map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute cursor-pointer hover:bg-blue-500/10 transition-colors duration-150 rounded"
                    style={{
                      left: `${link.bbox.left}%`,
                      top: `${link.bbox.top}%`,
                      width: `${link.bbox.width}%`,
                      height: `${link.bbox.height}%`,
                      zIndex: 5,
                    }}
                    title={link.url}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Best-effort CSS watermark overlay */}
      {watermarkText && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden select-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(buildWatermarkSvg(watermarkText))}")`,
            backgroundSize: '340px 180px',
            backgroundRepeat: 'repeat',
            opacity: 0.18,
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
});

PdfJsViewer.displayName = 'PdfJsViewer';

function buildWatermarkSvg(text) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="180">
    <text
      x="170"
      y="90"
      font-family="Arial, sans-serif"
      font-size="18"
      fill="#000000"
      text-anchor="middle"
      dominant-baseline="middle"
      transform="rotate(-35, 170, 90)"
    >${safe}</text>
  </svg>`;
}
