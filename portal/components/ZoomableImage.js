'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

export function ZoomableImage({ src, alt, width, height, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Focus management & Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const triggerEl = triggerRef.current;

    // Focus the close button when modal opens
    closeButtonRef.current?.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Prevent background scrolling while modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Restore focus to the trigger button when modal closes
      triggerEl?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="group relative block w-full text-left cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Enlarge image: ${alt || 'Screenshot preview'}`}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={`${className} transition duration-200 group-hover:opacity-95`}
        />
        {/* Zoom Hint Icon */}
        <div
          aria-hidden="true"
          className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/70 text-white opacity-0 shadow-sm backdrop-blur transition-opacity duration-200 group-hover:opacity-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-3.5 w-3.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
            />
          </svg>
        </div>
      </button>

      {/* Lightbox Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          {/* Close Button */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Close image preview"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Modal Dialog Content */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt || 'Image preview'}
            className="relative max-h-[90vh] max-w-[95vw] overflow-hidden rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              className="max-h-[85vh] w-auto object-contain rounded-xl"
              priority
            />
            {alt && (
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-center text-xs text-gray-200">
                {alt}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
