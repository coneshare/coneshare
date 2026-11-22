"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const INITIAL_PROGRESS = 0.18;
const MAX_PENDING_PROGRESS = 0.9;
const TRICKLE_INTERVAL_MS = 280;
const COMPLETE_HOLD_MS = 180;
const SAFETY_TIMEOUT_MS = 15000;

function normalizePathname(value) {
  if (!value) {
    return '/';
  }
  return value.replace(/\/+$/, '') || '/';
}

export function shouldStartNavigationProgress(anchor, currentLocation, event = {}) {
  if (!anchor) {
    return false;
  }

  if (
    event.button !== undefined &&
    event.button !== 0
  ) {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  if (anchor.hasAttribute('download')) {
    return false;
  }

  const target = anchor.getAttribute('target');
  if (target && target !== '_self') {
    return false;
  }

  const rawHref = anchor.getAttribute('href');
  if (!rawHref || rawHref.startsWith('#')) {
    return false;
  }

  if (/^(mailto:|tel:|javascript:)/i.test(rawHref)) {
    return false;
  }

  try {
    const baseHref = currentLocation?.href || window.location.href;
    const currentUrl = new URL(baseHref);
    const nextUrl = new URL(rawHref, currentUrl);

    if (nextUrl.origin !== currentUrl.origin) {
      return false;
    }

    if (normalizePathname(nextUrl.pathname) === normalizePathname(currentUrl.pathname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function NavigationProgress() {
  const pathname = usePathname();
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);

  const activePathRef = useRef(pathname);
  const statusRef = useRef('idle');
  const trickleTimerRef = useRef(null);
  const completeTimerRef = useRef(null);
  const resetTimerRef = useRef(null);
  const safetyTimerRef = useRef(null);

  const clearAllTimers = useCallback(() => {
    if (trickleTimerRef.current) {
      window.clearInterval(trickleTimerRef.current);
      trickleTimerRef.current = null;
    }
    if (completeTimerRef.current) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearAllTimers();
    if (statusRef.current === 'idle') {
      return;
    }

    statusRef.current = 'completing';
    setStatus('completing');
    setProgress(1);

    completeTimerRef.current = window.setTimeout(() => {
      statusRef.current = 'idle';
      setStatus('idle');
      resetTimerRef.current = window.setTimeout(() => {
        if (statusRef.current === 'idle') {
          setProgress(0);
        }
      }, 220);
    }, COMPLETE_HOLD_MS);
  }, [clearAllTimers]);

  const start = useCallback(() => {
    clearAllTimers();
    statusRef.current = 'loading';
    setStatus('loading');
    setProgress(INITIAL_PROGRESS);

    trickleTimerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= MAX_PENDING_PROGRESS) {
          return prev;
        }
        const remaining = MAX_PENDING_PROGRESS - prev;
        return Math.min(MAX_PENDING_PROGRESS, prev + Math.max(0.03, remaining * 0.28));
      });
    }, TRICKLE_INTERVAL_MS);

    safetyTimerRef.current = window.setTimeout(() => {
      finish();
    }, SAFETY_TIMEOUT_MS);
  }, [clearAllTimers, finish]);

  useEffect(() => {
    if (activePathRef.current === pathname) {
      return;
    }
    activePathRef.current = pathname;
    if (statusRef.current === 'loading') {
      finish();
    }
  }, [pathname, finish]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const anchor = event.target.closest('a[href]');
      if (shouldStartNavigationProgress(anchor, window.location, event)) {
        start();
      }
    };

    const handlePopState = () => {
      if (normalizePathname(window.location.pathname) !== normalizePathname(activePathRef.current)) {
        start();
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handlePopState);
      clearAllTimers();
    };
  }, [start, clearAllTimers]);

  const isVisible = status !== 'idle';

  return (
    <div
      aria-hidden="true"
      data-testid="navigation-progress"
      data-state={status}
      className={`fixed inset-x-0 top-0 z-50 h-[3px] pointer-events-none transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className={`nav-progress-bar relative h-full w-full origin-left overflow-hidden bg-gray-900 shadow-[0_0_8px_rgba(17,24,39,0.35)] ${
          status === 'loading' ? 'nav-progress-shimmer' : ''
        }`}
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
