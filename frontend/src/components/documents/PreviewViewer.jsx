import { useEffect, useRef } from 'react';
import { LazyImage } from './LazyImage';

export function PreviewViewer({ documentData, zoomLevel, onPageChange }) {
  const scrollContainerRef = useRef(null);
  const pageRefs = useRef(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry that is most visible in the viewport
        const mostVisibleEntry = entries.reduce((prev, current) => {
          return prev.intersectionRatio > current.intersectionRatio ? prev : current;
        });

        if (mostVisibleEntry && mostVisibleEntry.isIntersecting) {
          const pageNum = parseInt(mostVisibleEntry.target.dataset.pageNumber, 10);
          onPageChange(pageNum);
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: [0.25, 0.5, 0.75, 1.0], // Fire at different visibility levels for accuracy
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
  }, [documentData.pages, onPageChange]);

  return (
    <div
      ref={scrollContainerRef}
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
            />
          </div>
        ))}
      </div>
    </div>
  );
}
