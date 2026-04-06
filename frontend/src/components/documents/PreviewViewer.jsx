import { useEffect, useRef, useCallback, useState } from 'react';
import { LazyImage } from './LazyImage';
import { recordPageView } from '../../services/api';

export function PreviewViewer({ documentData, zoomLevel, onPageChange, viewId, dataroomVisitId }) {
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
    if (!scrollContainer) return;

    // Always start a newly loaded document at the first page.
    scrollContainer.scrollTop = 0;
    activePageRef.current = 1;
    timeOnPageRef.current = 0;
    visibilityRatiosRef.current.clear();
    onPageChange(1);

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
  }, [documentData.pages, onPageChange, sendTrackingData, scrollContainer]);

  return (
    <div
      ref={scrollContainerCallbackRef}
      className="h-full overflow-y-auto bg-gray-100 dark:bg-gray-800"
    >
      <div
        className="mx-auto flex w-fit origin-top flex-col items-center space-y-4 p-4 transition-transform duration-200"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {documentData.pages.map((page) => (
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
          >
            <LazyImage
              src={page.url}
              alt={`Page ${page.page_number}`}
              className="mx-auto max-w-full rounded-md shadow-md"
              scrollContainer={scrollContainer}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
