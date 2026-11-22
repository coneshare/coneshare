"use client";

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function PageTransition({ children, className = '' }) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const mainRef = useRef(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) {
      return undefined;
    }

    const handleAnimationEnd = (event) => {
      if (event.target === el) {
        el.classList.remove('page-transition-enter');
      }
    };

    el.addEventListener('animationend', handleAnimationEnd);
    return () => el.removeEventListener('animationend', handleAnimationEnd);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || previousPathRef.current === pathname) {
      return undefined;
    }
    previousPathRef.current = pathname;

    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      el.classList.remove('page-transition-enter');
      return undefined;
    }

    el.classList.remove('page-transition-enter');
    void el.offsetWidth;
    el.classList.add('page-transition-enter');

    const timer = window.setTimeout(() => {
      el.classList.remove('page-transition-enter');
    }, 340);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <main ref={mainRef} className={className}>
      {children}
    </main>
  );
}
