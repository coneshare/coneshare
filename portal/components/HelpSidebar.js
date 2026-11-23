'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

export default function HelpSidebar({
  sections = [],
  currentSlug,
  currentTitle,
  basePath = '/help',
  locale = 'en',
}) {
  const isZh = locale === 'zh';
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobilePanelId = useId();
  const navLabel = isZh ? '使用指南目录' : 'User Guide';

  const renderSectionList = (onNavigate) => (
    <ul className="space-y-6">
      {sections.map((section) => (
        <li key={section.id}>
          <p className="px-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {section.title}
          </p>
          <ul className="mt-2 space-y-1 border-l border-gray-200 pl-2">
            {section.guides.map((guide) => {
              const active = guide.slug === currentSlug;
              return (
                <li key={guide.slug}>
                  <Link
                    href={`${basePath}/${guide.slug}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                    className={`block rounded-md px-2.5 py-1.5 text-sm leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${
                      active
                        ? 'bg-gray-100 font-semibold text-gray-900 ring-1 ring-inset ring-gray-300'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {guide.navTitle || guide.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );

  return (
    <aside className="lg:w-64 lg:shrink-0 lg:self-start lg:sticky lg:top-24">
      {/* Mobile disclosure trigger */}
      <div className="lg:hidden rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-controls={mobilePanelId}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <span className="truncate">
            {navLabel}
            {currentTitle ? ` · ${currentTitle}` : ''}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 motion-reduce:transition-none ${
              mobileOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
        {mobileOpen && (
          <nav
            id={mobilePanelId}
            aria-label={navLabel}
            className="border-t border-gray-200 px-3 py-4"
          >
            {renderSectionList(() => setMobileOpen(false))}
          </nav>
        )}
      </div>

      {/* Desktop persistent sidebar */}
      <nav
        aria-label={navLabel}
        className="hidden lg:block max-h-[calc(100vh-7rem)] overflow-y-auto pr-2"
      >
        <div className="mb-4 px-2.5">
          <Link
            href={basePath}
            className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← {isZh ? '帮助中心首页' : 'Help Center'}
          </Link>
        </div>
        {renderSectionList(undefined)}
      </nav>
    </aside>
  );
}
