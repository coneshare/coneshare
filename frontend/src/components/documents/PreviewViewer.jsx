import { useEffect, useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { LazyImage } from './LazyImage';
import { recordPageView } from '../../services/api';
import { useLinkClickTracking } from '../../hooks/useLinkClickTracking';
import { isSafeUrl } from '../../lib/utils';

export const PreviewViewer = forwardRef(({ documentData, zoomLevel, onPageChange, viewId, dataroomVisitId }, ref) => {
  const pages = useMemo(
    () => (Array.isArray(documentData?.pages) ? documentData.pages : []),
    [documentData?.pages]
  );
  const documentIdentity = documentData?.id ?? documentData?.document_id ?? documentData?.name ?? null;
  const [scrollContainer, setScrollContainer] = useState(null);
  const pageRefs = useRef(new Map());
  const visibilityRatiosRef = useRef(new Map());
  const activePageRef = useRef(1);
  const timeOnPageRef = useRef(0);
  const intervalRef = useRef(null);
  const isInactiveRef = useRef(false);
  const inactivityTimerRef = useRef(null);

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

  const handleLinkClick = useLinkClickTracking(viewId, dataroomVisitId);

  // Expose goToPage ref
  useImperativeHandle(ref, () => ({
    goToPage: (pageNumber) => {
      const pageEl = pageRefs.current.get(pageNumber);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }));

  useEffect(() => {
    const tick = () => {
      if (!isInactiveRef.current) {
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
    };
  }, [viewId, sendTrackingData]);

  useEffect(() => {
    if (!viewId) return;

    const INACTIVITY_TIMEOUT = 60000; // 60 seconds

    const handleActivity = () => {
      isInactiveRef.current = false;
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        isInactiveRef.current = true;
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousemove', 'keydown', 'scroll', 'mousedown'];
    events.forEach((event) => window.addEventListener(event, handleActivity));
    handleActivity(); // Initial call to start the timer

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      clearTimeout(inactivityTimerRef.current);
    };
  }, [viewId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sendTrackingData(activePageRef.current, timeOnPageRef.current, true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendTrackingData]);

  useEffect(() => {
    if (!scrollContainer || !documentIdentity) return;

    // Always start a newly loaded document at the first page.
    scrollContainer.scrollTop = 0;
    activePageRef.current = 1;
    timeOnPageRef.current = 0;
    visibilityRatiosRef.current.clear();
    onPageChange(1);
  }, [documentIdentity, onPageChange, scrollContainer]);

  useEffect(() => {
    if (!scrollContainer) return;

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
        threshold: [0.25, 0.5, 0.75], // Trigger when a good portion is visible
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
  }, [pages, onPageChange, sendTrackingData, scrollContainer]);

  return (
    <div
      ref={scrollContainerCallbackRef}
      className="h-full overflow-y-auto bg-gray-100 dark:bg-gray-800"
    >
      <div
        className="mx-auto flex w-fit origin-top flex-col items-center space-y-4 p-4 pb-24 transition-transform duration-200"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {pages.map((page) => (
          <div
            key={page.page_number}
            ref={(node) => {
              if (node) {
                pageRefs.current.set(page.page_number, node);
              } else {
                pageRefs.current.delete(page.page_number);
              }
            }}
            data-page-number={page.page_number}
            className="relative mx-auto w-fit"
          >
            <LazyImage
              src={page.url}
              alt={`Page ${page.page_number}`}
              className="mx-auto max-w-full rounded-md shadow-md"
              scrollContainer={scrollContainer}
            />
            {page.page_links?.links?.filter(link => isSafeUrl(link.url) && link.bbox).map((link, idx) => (
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
                onClick={() => handleLinkClick(link.url, page.page_number)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

PreviewViewer.displayName = 'PreviewViewer';
