'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const tabs = [
  {
    id: 'pdf',
    label: 'PDF',
    src: '/screenshots/preview-pdf.png',
    alt: 'PDF document viewer with responsive pagination',
    altZh: 'PDF 格式免安装在线预览与自适应分页',
    width: 1292,
    height: 737,
  },
  {
    id: 'docx',
    label: 'DOCX / PPT',
    src: '/screenshots/preview-docx.png',
    alt: 'Word and presentation preview with vector typography',
    altZh: '文档、表格与演示文稿高清矢量渲染，桌面端与手机微信即点即看',
    width: 1295,
    height: 733,
  },
  {
    id: 'xls',
    label: 'XLS / CSV',
    src: '/screenshots/preview-spreadsheet.png',
    alt: 'Spreadsheet viewer with tabular grid and formulas',
    altZh: '电子表格在线预览与公式支持',
    width: 1296,
    height: 735,
  },
  {
    id: 'heic',
    label: 'IMAGE / HEIC',
    src: '/screenshots/preview-image.png',
    alt: 'High-efficiency HEIC and image viewer preview',
    altZh: '高清大图与 HEIC 格式秒开预览',
    width: 1533,
    height: 819,
  },
  {
    id: 'mp4',
    label: 'MP4',
    src: '/screenshots/preview-video.png',
    alt: 'Streaming video player preview',
    altZh: '音视频在线流式播放',
    width: 1376,
    height: 761,
  },
];

export function MultiFormatPreviewMockup({ autoRotateInterval = 3200, locale }) {
  const pathname = usePathname();
  const isZh = locale === 'zh' || pathname?.startsWith('/zh');
  const [activeTab, setActiveTab] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasManuallySelected, setHasManuallySelected] = useState(false);

  useEffect(() => {
    // Stop rotating if user manually selected a tab, hovered, focused, or prefers reduced motion
    if (hasManuallySelected || isHovered || isFocused) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const timer = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % tabs.length);
    }, autoRotateInterval);

    return () => clearInterval(timer);
  }, [hasManuallySelected, isHovered, isFocused, autoRotateInterval]);

  const current = tabs[activeTab];

  return (
    <div
      className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsFocused(false);
        }
      }}
    >
      {/* Interactive Tabs Bar with ARIA tablist */}
      <div
        role="tablist"
        aria-label="Document format previews"
        className="flex items-center gap-1.5 border-b border-gray-150 pb-2.5 text-[11px] overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab, idx) => {
          const isActive = idx === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`format-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`format-panel-${tab.id}`}
              type="button"
              onClick={() => {
                setActiveTab(idx);
                setHasManuallySelected(true);
              }}
              className={`rounded px-2.5 py-1 font-semibold transition cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Screenshot Preview Viewport / Tabpanel */}
      <div
        role="tabpanel"
        id={`format-panel-${current.id}`}
        aria-labelledby={`format-tab-${current.id}`}
        className="mt-3.5 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-xs"
      >
        <Image
          key={current.src}
          src={current.src}
          alt={isZh ? current.altZh : current.alt}
          width={current.width}
          height={current.height}
          className="w-full h-auto max-h-[175px] object-cover object-top transition-opacity duration-300"
        />
      </div>

      {/* Caption below preview */}
      <p className="mt-2.5 text-center text-xs text-gray-500 italic select-none">
        {isZh ? current.altZh : current.alt}
      </p>
    </div>
  );
}
