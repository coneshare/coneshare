'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ZoomableImage } from './ZoomableImage';
import { getAgentScreenshots } from '../lib/agentsData';

export function AgentScreenshotsShowcase({ locale = 'en', screenshots }) {
  const items = screenshots || getAgentScreenshots(locale);
  const isZh = locale === 'zh';
  const [activeIndex, setActiveIndex] = useState(0);
  const current = items[activeIndex] || items[0];

  const goPrevious = () => {
    setActiveIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative w-full">
      {/* Outer Frame matching HomepageMockupCarousel */}
      <div className="relative rounded-2xl border border-gray-200 bg-gray-900/5 p-2 shadow-2xl">
        <div className="rounded-xl border border-gray-200/80 bg-white shadow-sm overflow-hidden relative">
          <div className="relative bg-gray-100">
            <ZoomableImage
              src={current.src}
              alt={current.alt}
              width={1440}
              height={900}
              className="w-full h-auto max-h-[540px] object-contain mx-auto"
            />

            {/* Left/Right Controls */}
            <button
              type="button"
              onClick={goPrevious}
              className="absolute top-1/2 left-3 -translate-y-1/2 bg-black/35 hover:bg-black/55 text-white p-1.5 rounded-full shadow transition-all focus:outline-none cursor-pointer"
              aria-label={isZh ? '上一张截图' : 'Previous screenshot'}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute top-1/2 right-3 -translate-y-1/2 bg-black/35 hover:bg-black/55 text-white p-1.5 rounded-full shadow transition-all focus:outline-none cursor-pointer"
              aria-label={isZh ? '下一张截图' : 'Next screenshot'}
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-1.5 z-10 bg-black/25 rounded-full px-3 py-1.5">
              {items.map((shot, idx) => (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={`h-2 w-2 rounded-full transition-all duration-300 cursor-pointer ${
                    activeIndex === idx ? 'bg-white scale-125' : 'bg-white/45 hover:bg-white/75'
                  }`}
                  aria-label={isZh ? `查看第 ${idx + 1} 张截图` : `View screenshot ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Caption matching HomepageMockupCarousel */}
      <p className="mt-3 text-center text-xs sm:text-sm text-gray-500 italic select-none">
        {current.caption}
      </p>
    </div>
  );
}
