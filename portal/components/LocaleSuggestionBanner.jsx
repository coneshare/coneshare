'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, X } from 'lucide-react';
import {
  getChineseCounterpartPath,
  isAutomatedCrawler,
  isChineseBrowserLocale,
  readLocalePreference,
  saveLocalePreference,
} from '../lib/i18n';

export function LocaleSuggestionBanner({
  translatedBlogSlugs = [],
  translatedHelpSlugs = [],
}) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  const targetZhPath = getChineseCounterpartPath(pathname, {
    translatedBlogSlugs,
    translatedHelpSlugs,
  });

  useEffect(() => {
    if (!targetZhPath) {
      setVisible(false);
      return;
    }

    if (readLocalePreference()) {
      setVisible(false);
      return;
    }

    if (
      isAutomatedCrawler(navigator.userAgent) ||
      !isChineseBrowserLocale(navigator.languages, navigator.language)
    ) {
      setVisible(false);
      return;
    }

    setVisible(true);
  }, [targetZhPath]);

  if (!visible || !targetZhPath) {
    return null;
  }

  return (
    <aside
      role="region"
      aria-label="中文版本提示"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:bottom-5 sm:right-5"
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-2.5 rounded-full border border-gray-200 bg-white/95 px-3.5 py-2 text-xs shadow-lg backdrop-blur-sm sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
          <span className="truncate font-medium text-gray-900">切换到中文版？</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={targetZhPath}
            onClick={() => {
              saveLocalePreference('zh');
              setVisible(false);
            }}
            className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-800 sm:rounded-lg motion-reduce:transition-none"
          >
            切换中文
          </Link>
          <button
            type="button"
            onClick={() => {
              saveLocalePreference('en');
              setVisible(false);
            }}
            aria-label="关闭语言切换提示"
            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 motion-reduce:transition-none"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
