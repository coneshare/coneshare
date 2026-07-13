'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const mockImages = [
  {
    src: '/screenshots/feat-vdr-add-content.png',
    alt: 'Organize files and folders in custom datarooms',
    url: 'https://app.coneshare.com/datarooms/01KNEQH639ANTVC0JE8JP37298?tab=documents'
  },
  {
    src: '/screenshots/feat-vdr-viewer.png',
    alt: 'Preview documents and videos in datarooms',
    url: 'https://app.coneshare.com/view/PpyMwCrvJeQAXlaq1cREAw'
  },
  {
    src: '/screenshots/feat-vdr-manage-perm.png',
    alt: 'Granular per-item visibility and download settings',
    url: 'https://app.coneshare.com/datarooms/01KNEQH639ANTVC0JE8JP37298'
  },
  {
    src: '/screenshots/feat-sharing.png',
    alt: 'Configure secure links, expiration, and watermarks',
    url: 'https://app.coneshare.com/datarooms/01KNEQH639ANTVC0JE8JP37298'
  },
  {
    src: '/screenshots/feat-analytics.png',
    alt: 'Real-time viewer engagement and page tracking',
    url: 'https://app.coneshare.com/datarooms/01KNEQH639ANTVC0JE8JP37298'
  }
];

export function DataroomMockupCarousel({ autoPlayInterval = 6000 }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? mockImages.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const goToNext = useCallback(() => {
    const isLastSlide = currentIndex === mockImages.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  }, [currentIndex]);

  const goToSlide = (slideIndex) => {
    setCurrentIndex(slideIndex);
  };

  useEffect(() => {
    if (!autoPlayInterval) return;
    const interval = setInterval(() => {
      goToNext();
    }, autoPlayInterval);
    return () => clearInterval(interval);
  }, [currentIndex, autoPlayInterval, goToNext]);

  return (
    <div className="relative w-full">
      {/* Outer Browser Mock Frame */}
      <div className="relative rounded-2xl border border-gray-200 bg-gray-900/5 p-2 shadow-2xl backdrop-blur-sm">
        <div className="rounded-xl border border-gray-200/80 bg-white shadow-sm overflow-hidden relative">
          
          {/* Browser Bar */}
          <div className="bg-gray-50 border-b border-gray-150 px-4 py-3 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400"></span>
            <span className="h-3 w-3 rounded-full bg-yellow-400"></span>
            <span className="h-3 w-3 rounded-full bg-green-400"></span>
            <div className="bg-white border border-gray-200 rounded text-[10px] text-gray-400 px-6 py-0.5 ml-4 flex-grow max-w-md truncate select-none">
              {mockImages[currentIndex].url}
            </div>
          </div>

          {/* Slides Viewport */}
          <div className="overflow-hidden relative bg-gray-50">
            <div
              className="flex transition-transform ease-in-out duration-500"
              style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
              {mockImages.map((image, index) => (
                <div key={index} className="w-full flex-shrink-0 relative">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={1200}
                    height={750}
                    className="w-full h-auto object-contain"
                    priority={index === 0}
                  />
                </div>
              ))}
            </div>

            {/* Left/Right Control Buttons */}
            <button
              onClick={goToPrevious}
              className="absolute top-1/2 left-3 -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-1.5 rounded-full shadow transition-all focus:outline-none"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute top-1/2 right-3 -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-1.5 rounded-full shadow transition-all focus:outline-none"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Slider Dots */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-1.5 z-10 bg-black/10 rounded-full px-3 py-1.5 backdrop-blur-xs">
              {mockImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    currentIndex === index ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>

          </div>

        </div>
      </div>
      
      {/* Caption/Label below the browser */}
      <p className="mt-3 text-center text-xs text-gray-500 italic select-none">
        {mockImages[currentIndex].alt}
      </p>
    </div>
  );
}
