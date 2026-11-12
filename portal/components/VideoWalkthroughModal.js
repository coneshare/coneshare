"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, X } from 'lucide-react';

export function VideoWalkthroughModal({
  videoUrl = 'https://cdn.coneshare.com/coneshare-walkthrough-v1.mp4',
  posterUrl = 'https://cdn.coneshare.com/coneshare.jpg',
  buttonLabel = 'Watch Walkthrough (2 mins)',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const handleClose = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsOpen(false);
  }, []);

  const handleStartPlay = () => {
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  // Close on ESC key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Prevent body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-2 text-sm font-semibold leading-6 text-gray-900 hover:text-gray-600 transition-colors cursor-pointer group ${className}`}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
          <Play className="h-3 w-3 fill-gray-900 text-gray-900 ml-0.5" />
        </span>
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm transition-opacity"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-5xl rounded-2xl bg-black shadow-2xl overflow-hidden border border-gray-800 z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Top Bar with Title and Close */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900/90 border-b border-gray-800 text-gray-300">
              <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80 inline-block" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80 inline-block" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/80 inline-block" />
                <span className="ml-2 font-sans font-medium text-gray-300">ConeShare Walkthrough (2 mins)</span>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Video Player Container */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                poster={posterUrl}
                controls={isPlaying}
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => {
                  if (videoRef.current && videoRef.current.ended) {
                    setIsPlaying(false);
                  }
                }}
                className="h-full w-full object-contain"
              >
                Your browser does not support the video tag.
              </video>

              {/* High-Trust Glass Poster Overlay */}
              {!isPlaying && (
                <div
                  onClick={handleStartPlay}
                  className="absolute inset-0 cursor-pointer group flex items-center justify-center transition-all bg-black/5 hover:bg-black/15"
                >
                  {/* Poster Image Layer */}
                  {posterUrl && (
                    <img
                      src={posterUrl}
                      alt="ConeShare Walkthrough Poster"
                      className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                    />
                  )}

                  {/* Clean bottom-center pill: leaves center logo 100% unobstructed */}
                  <div className="absolute bottom-6 z-10 flex items-center gap-2 rounded-full bg-gray-900/85 backdrop-blur-md border border-white/15 px-4 py-2 text-xs font-semibold text-white shadow-xl transition-all duration-200 group-hover:scale-105 group-hover:bg-gray-900">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20">
                      <Play className="h-2.5 w-2.5 fill-white text-white ml-0.5" />
                    </span>
                    <span>Click anywhere to play video</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
