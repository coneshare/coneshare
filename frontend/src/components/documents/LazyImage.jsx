import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '../ui/Skeleton';

// A reasonable placeholder height that approximates a document page to prevent layout shift.
const PLACEHOLDER_HEIGHT = '1122px'; // A4 height at 96 DPI

export function LazyImage({ src, alt, className, scrollContainer }) {
  const [isVisible, setIsVisible] = useState(false);
  const placeholderRef = useRef(null);

  useEffect(() => {
    // Wait until the scroll container is mounted and passed as a prop
    if (!scrollContainer) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // When the placeholder enters the viewport, set isVisible to true
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Stop observing once it's visible
        }
      },
      {
        root: scrollContainer,
        // Start loading the image when it's 250px away from the viewport
        rootMargin: '250px',
      }
    );

    if (placeholderRef.current) {
      observer.observe(placeholderRef.current);
    }

    return () => observer.disconnect();
  }, [src, scrollContainer]);

  return isVisible ? (
    <img src={src} alt={alt} className={className} />
  ) : (
    <div
      ref={placeholderRef}
      className={className}
      style={{ height: PLACEHOLDER_HEIGHT, width: '100%' }}
    >
      <Skeleton className="h-full w-full" />
    </div>
  );
}
