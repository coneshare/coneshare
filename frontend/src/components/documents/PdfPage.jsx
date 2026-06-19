/**
 * PdfPage Component
 * 
 * Renders a single page of a PDF document onto an HTML5 <canvas>.
 * Responsibilities:
 * 1. Virtualization & Lazy Rendering: Uses a localized IntersectionObserver
 *    with a large rootMargin (1200px buffer) to only fetch and paint the page
 *    when it is close to entering the viewport, and unrenders it when far away.
 * 2. Crisp Scaling: Renders high-DPI canvas paths matching window.devicePixelRatio.
 * 3. Cancellation Management: Cancels any active render task if scale/zoom changes
 *    or if the page is unmounted before rendering completes.
 */

import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '../ui/Skeleton';

// Fallback A4 page height/width ratio if dimensions aren't loaded yet
const DEFAULT_ASPECT_RATIO = 1.414; // A4 height / width

export function PdfPage({ pdfDoc, pageNumber, scale, scrollContainer, dimensions }) {
  const [isVisible, setIsVisible] = useState(false);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  // 1. Observe visibility using IntersectionObserver to support lazy rendering/unrendering
  useEffect(() => {
    if (!scrollContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisible(entry.isIntersecting);
      },
      {
        root: scrollContainer,
        // Start rendering when page is within 1200px of the viewport
        rootMargin: '1200px 0px 1200px 0px',
      }
    );

    const el = containerRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      if (el) {
        observer.unobserve(el);
      }
      observer.disconnect();
    };
  }, [scrollContainer]);

  // 2. Fetch page proxy when visible
  useEffect(() => {
    if (!pdfDoc || !isVisible) {
      setPage(null);
      return;
    }

    let isCancelled = false;
    setLoading(true);

    pdfDoc.getPage(pageNumber).then(
      (pageProxy) => {
        if (!isCancelled) {
          setPage(pageProxy);
          setLoading(false);
        }
      },
      (err) => {
        console.error(`Failed to load page ${pageNumber}:`, err);
        if (!isCancelled) {
          setLoading(false);
        }
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNumber, isVisible]);

  // 3. Render page to canvas when page proxy or scale changes
  useEffect(() => {
    if (!page || !isVisible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Cancel any ongoing render task for this canvas
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale });

    // Set high-DPI canvas dimensions
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    // Reset transform before scaling
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    const renderTask = page.render(renderContext);
    renderTaskRef.current = renderTask;

    renderTask.promise.then(
      () => {
        renderTaskRef.current = null;
      },
      (err) => {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNumber} render error:`, err);
        }
      }
    );

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [page, scale, isVisible, pageNumber]);

  // Calculate style dimensions based on pre-fetched page sizes and current scale
  const getPlaceholderStyle = () => {
    const baseWidth = dimensions?.width || 792;
    const baseHeight = dimensions?.height || (baseWidth * DEFAULT_ASPECT_RATIO);
    
    // Scale matching current viewer setting
    const width = baseWidth * scale;
    const height = baseHeight * scale;

    return {
      width: `${width}px`,
      height: `${height}px`,
      maxWidth: '100%',
    };
  };

  const placeholderStyle = getPlaceholderStyle();

  return (
    <div
      ref={containerRef}
      style={placeholderStyle}
      className="relative mx-auto rounded-md shadow-md bg-white overflow-hidden"
    >
      {isVisible && page ? (
        <canvas
          ref={canvasRef}
          className="mx-auto block rounded-md"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-700">
          <Skeleton className="h-full w-full" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50">
              <span className="text-sm font-medium text-gray-500">Loading page {pageNumber}...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
