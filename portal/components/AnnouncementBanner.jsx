'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

const DISMISS_STORAGE_KEY = 'coneshare_mcp_banner_dismissed';

export function AnnouncementBanner({ locale }) {
  const pathname = usePathname();
  const isZh = locale === 'zh' || (locale ? false : pathname?.startsWith('/zh'));
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === '1') {
        setIsDismissed(true);
      }
    } catch {
      // Ignore storage access restrictions in private browsing modes.
    }
  }, []);

  const normalizedPath = pathname ? pathname.replace(/\/+$/, '') || '/' : '/';
  if (isDismissed || normalizedPath === '/agents' || normalizedPath === '/zh/agents') {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      // Ignore storage access restrictions.
    }
  };

  const targetHref = isZh ? '/zh/agents' : '/agents';

  return (
    <div
      role="region"
      aria-label={isZh ? '最新功能通知' : 'Product announcement'}
      className="relative bg-gray-900 text-gray-100 border-b border-gray-800"
    >
      <div className="mx-auto max-w-7xl px-10 py-2 text-center text-xs leading-5 sm:text-[13px]">
        <Link
          href={targetHref}
          className="group inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-gray-100 hover:text-white transition-colors duration-150"
        >
          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold tracking-wide text-gray-900">
            {isZh ? '新功能' : 'New'}
          </span>
          <span className="text-gray-200">
            {isZh
              ? '通过官方 MCP 连接器将 ConeShare 接入 ChatGPT、Gemini 与 Claude。'
              : 'Bring ConeShare to ChatGPT, Gemini, and Claude with our MCP connector.'}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-white underline-offset-4 group-hover:underline">
            <span>{isZh ? '了解更多' : 'Learn more'}</span>
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
            >
              &rarr;
            </span>
          </span>
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={isZh ? '关闭通知' : 'Dismiss announcement'}
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
