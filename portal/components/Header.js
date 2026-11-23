"use client";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { features, solutions } from '../lib/content';
import { ChevronDown, Menu, X } from 'lucide-react';

const signupUrl = 'https://app.coneshare.com/signup';

function normalizePath(value) {
  if (!value) return '/';
  return value.replace(/\/+$/, '') || '/';
}

function isRouteActive(pathname, href, { prefix = false } = {}) {
  if (!href || href.startsWith('http')) return false;
  const current = normalizePath(pathname);
  const target = normalizePath(href);
  if (current === target) return true;
  return prefix && current.startsWith(`${target}/`);
}

function getFeatureHref(baseHref, item) {
  return item.isAlternative ? '/alternatives/docsend' : `${baseHref}/${item.slug}`;
}

function getFeatureMenuItems(isZh) {
  const mapped = features.map((item) => {
    if (item.type === 'group') {
      return item;
    }
    return {
      key: item.slug,
      label: isZh && item.menuNameZh ? item.menuNameZh : item.menuName,
      href: getFeatureHref('/features', item),
    };
  });

  mapped.push({
    key: 'agents',
    label: isZh ? 'AI 与自动化 (MCP)' : 'Agents & MCP',
    href: isZh ? '/zh/agents' : '/agents',
  });

  return mapped;
}

function getDesktopNavTriggerClasses(active, highlighted = active) {
  return `group relative inline-flex items-center gap-x-1 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:text-gray-900 ${
    active ? 'font-semibold' : 'font-medium'
  } ${highlighted ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`;
}

function getDropdownItemClasses(active) {
  return `block w-full text-left px-4 py-2 text-sm transition-colors duration-150 ${
    active
      ? 'bg-gray-100 font-medium text-gray-900'
      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
  }`;
}

function getMobileNavLinkClasses(active) {
  return `block rounded-md px-3 py-2 text-base transition-colors duration-150 ${
    active
      ? 'bg-gray-100 font-semibold text-gray-900'
      : 'font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900'
  }`;
}

function NavUnderline({ visible = false }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gray-900 origin-center transition-transform duration-200 ease-out motion-reduce:transition-none ${
        visible
          ? 'scale-x-100'
          : 'scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100'
      }`}
    />
  );
}

function HeaderDropdown({ title, panelWidthClass, isActive, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        const shouldRestoreFocus = containerRef.current?.contains(document.activeElement);
        setIsOpen(false);
        if (shouldRestoreFocus) {
          triggerRef.current?.focus();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleBlur = (event) => {
    if (!containerRef.current?.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onBlur={handleBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={getDesktopNavTriggerClasses(isActive, isActive || isOpen)}
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
        <NavUnderline visible={isOpen} />
      </button>

      {isOpen && (
        <div className="absolute left-1/2 top-full -translate-x-1/2 pt-2 z-10">
          <div
            className={`nav-dropdown-panel bg-white shadow-lg rounded-lg py-2 ${panelWidthClass} ring-1 ring-black ring-opacity-5`}
          >
            {children(() => setIsOpen(false))}
          </div>
        </div>
      )}
    </div>
  );
}

const getResourceMenuItems = (isZh) => [
  {
    key: 'help',
    name: isZh ? '帮助中心' : 'Help Center',
    href: isZh ? '/zh/help' : '/help',
  },
  {
    key: 'about',
    name: isZh ? '关于我们' : 'About',
    href: isZh ? '/zh/about' : '/about',
  },
  {
    key: 'docs',
    name: isZh ? '运维部署文档' : 'Server Admin Docs',
    href: 'https://docs.coneshare.com/en/',
    external: true,
  },
  {
    key: 'release-notes',
    name: isZh ? '发布说明' : 'Release Notes',
    href: 'https://docs.coneshare.com/en/release-notes/',
    external: true,
  },
  {
    key: 'forum',
    name: isZh ? '社区论坛' : 'Forum',
    href: 'https://github.com/orgs/coneshare/discussions',
    external: true,
  },
  {
    key: 'contribute',
    name: isZh ? '参与贡献' : 'Contribute',
    href: 'https://github.com/coneshare/coneshare',
    external: true,
  },
];

export function Header({ locale }) {
  const pathname = usePathname();
  const isZh = locale === 'zh' || (locale ? false : pathname?.startsWith('/zh'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const resourceMenuItems = getResourceMenuItems(isZh);

  const primaryLinks = [
    {
      href: isZh ? '/zh/virtual-dataroom' : '/virtual-dataroom',
      label: isZh ? '虚拟资料室' : 'Virtual Dataroom',
    },
    {
      href: isZh ? '/zh/pricing' : '/pricing',
      label: isZh ? '方案定价' : 'Pricing',
    },
  ];

  const featureMenuItems = getFeatureMenuItems(isZh);
  const blogHref = isZh ? '/zh/blog' : '/blog';
  const blogActive = isRouteActive(pathname, blogHref, { prefix: true });
  const featuresActive =
    isRouteActive(pathname, '/features', { prefix: true }) ||
    featureMenuItems.some((item) => item.type !== 'group' && isRouteActive(pathname, item.href));
  const resourcesActive = resourceMenuItems.some(
    (item) => !item.external && isRouteActive(pathname, item.href, { prefix: true })
  );
  const demoActive = isRouteActive(pathname, '/demo');

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    const handleMouseDown = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header ref={headerRef} className="bg-white shadow-sm sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link
                href={isZh ? '/zh' : '/'}
                className="inline-flex items-center transition-opacity duration-200 hover:opacity-80"
              >
                <Image
                  className="h-10 w-auto"
                  src="/logo.svg"
                  alt="Coneshare Logo"
                  width={175}
                  height={40}
                  priority
                />
              </Link>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav aria-label={isZh ? '主导航' : 'Main navigation'} className="hidden md:flex md:items-center md:gap-x-5">
            {primaryLinks.map((item) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={getDesktopNavTriggerClasses(active)}
                >
                  <span>{item.label}</span>
                  <NavUnderline />
                </Link>
              );
            })}

            <HeaderDropdown
              title={isZh ? '功能特性' : 'Features'}
              panelWidthClass="w-80"
              isActive={featuresActive}
            >
              {(closeMenu) =>
                featureMenuItems.map((item) => {
                  if (item.type === 'group') {
                    return (
                      <div key={item.key || item.label} className="px-4 py-2">
                        {item.label && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {item.label}
                          </p>
                        )}
                        {item.divider && <div className="mt-2 border-t border-gray-200" />}
                      </div>
                    );
                  }
                  const active = isRouteActive(pathname, item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeMenu}
                      className={getDropdownItemClasses(active)}
                    >
                      {item.label}
                    </Link>
                  );
                })
              }
            </HeaderDropdown>

            <Link
              href={blogHref}
              aria-current={blogActive ? 'page' : undefined}
              className={getDesktopNavTriggerClasses(blogActive)}
            >
              <span>{isZh ? '博客' : 'Blog'}</span>
              <NavUnderline />
            </Link>

            <HeaderDropdown
              title={isZh ? '资源' : 'Resources'}
              panelWidthClass="w-56"
              isActive={resourcesActive}
            >
              {(closeMenu) =>
                resourceMenuItems.map((item) => {
                  const active = !item.external && isRouteActive(pathname, item.href, { prefix: true });
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      aria-current={active ? 'page' : undefined}
                      onClick={closeMenu}
                      className={getDropdownItemClasses(active)}
                    >
                      {item.name}
                    </Link>
                  );
                })
              }
            </HeaderDropdown>

            <Link
              href="/demo"
              aria-current={demoActive ? 'page' : undefined}
              className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98] ${
                demoActive
                  ? 'border-gray-900 bg-gray-100 text-gray-900'
                  : 'border-gray-300 text-gray-900 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              {isZh ? '在线演示' : 'Live Demo'}
            </Link>
            <Link
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-gray-800 active:scale-[0.98]"
            >
              {isZh ? '立即开始' : 'Get Started'}
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <div className="-mr-2 flex items-center md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-500"
              aria-controls="mobile-menu"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Panel */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden absolute inset-x-0 top-full bg-white shadow-lg border-t border-gray-100 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain"
          id="mobile-menu"
        >
          <div className="space-y-4 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="space-y-1">
              {primaryLinks.map((item) => {
                const active = isRouteActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={getMobileNavLinkClasses(active)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">
                {isZh ? '功能特性' : 'Features'}
              </h3>
              <div className="mt-2 space-y-1">
                {featureMenuItems.map((item) => {
                  if (item.type === 'group') {
                    return item.label ? (
                      <p
                        key={item.key || item.label}
                        className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {item.label}
                      </p>
                    ) : null;
                  }
                  const active = isRouteActive(pathname, item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={getMobileNavLinkClasses(active)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">
                {isZh ? '应用场景' : 'Use Cases'}
              </h3>
              <div className="mt-2 space-y-1">
                {solutions.map((item) => {
                  const itemHref = `/solutions/${item.slug}`;
                  const active = isRouteActive(pathname, itemHref);
                  return (
                    <Link
                      key={item.slug}
                      href={itemHref}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={getMobileNavLinkClasses(active)}
                    >
                      {item.menuName}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4 space-y-1">
              <Link
                href={blogHref}
                aria-current={blogActive ? 'page' : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
                className={getMobileNavLinkClasses(blogActive)}
              >
                {isZh ? '博客' : 'Blog'}
              </Link>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">
                {isZh ? '资源' : 'Resources'}
              </h3>
              <div className="mt-2 space-y-1">
                {resourceMenuItems.map((item) => {
                  const active = !item.external && isRouteActive(pathname, item.href, { prefix: true });
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={getMobileNavLinkClasses(active)}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <Link
                href="/demo"
                aria-current={demoActive ? 'page' : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`block w-full text-center rounded-md border px-4 py-2 text-base font-medium shadow-sm transition-colors duration-150 ${
                  demoActive
                    ? 'border-gray-900 bg-gray-100 text-gray-900'
                    : 'border-gray-300 text-gray-900 hover:bg-gray-50'
                }`}
              >
                {isZh ? '在线演示' : 'Live Demo'}
              </Link>
              <Link
                href={signupUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-3 block w-full text-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-base font-medium text-white shadow-sm transition-colors duration-150 hover:bg-gray-800"
              >
                {isZh ? '立即开始' : 'Get Started'}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
