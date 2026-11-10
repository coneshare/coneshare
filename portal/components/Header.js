"use client";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { features, solutions } from '../lib/content';
import { ChevronDown, Menu, X } from 'lucide-react';

function NavDropdown({ title, href, items, isZh }) {
  const [isOpen, setIsOpen] = useState(false);
  const node = useRef();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (node.current.contains(e.target)) {
        // inside click
        return;
      }
      // outside click
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={node}
      className="relative -my-2 py-2"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="text-sm font-medium text-gray-500 hover:text-gray-900 inline-flex items-center gap-x-1 py-2"
      >
        <span>{title}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg mt-2 py-2 w-80 z-10 ring-1 ring-black ring-opacity-5"
        >
          {items.map((item) => (
            item.type === 'group' ? (
              <div key={item.key || item.label} className="px-4 py-2">
                {item.label && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
                )}
                {item.divider && <div className="mt-2 border-t border-gray-200" />}
              </div>
            ) : (
              <Link
                key={item.slug}
                href={item.isAlternative ? '/alternatives/docsend' : `${href}/${item.slug}`}
                onClick={() => setIsOpen(false)}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {(isZh && item.menuNameZh) ? item.menuNameZh : item.menuName}
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
}

const getResourceMenuItems = (isZh) => [
  {
    key: 'about',
    name: isZh ? '关于我们' : 'About',
    href: isZh ? '/zh/about' : '/about',
  },
  {
    key: 'docs',
    name: isZh ? '开发文档' : 'Docs',
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

const signupUrl = 'https://app.coneshare.com/signup';

function ResourceDropdown({ title, items }) {
  const [isOpen, setIsOpen] = useState(false);
  const node = useRef();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (node.current.contains(e.target)) {
        return;
      }
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={node}
      className="relative -my-2 py-2"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="text-sm font-medium text-gray-500 hover:text-gray-900 inline-flex items-center gap-x-1 py-2"
      >
        <span>{title}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg mt-2 py-2 w-56 z-10 ring-1 ring-black ring-opacity-5">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              onClick={() => setIsOpen(false)}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}


export function Header({ locale }) {
  const pathname = usePathname();
  const isZh = locale === 'zh' || (locale ? false : pathname?.startsWith('/zh'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const resourceMenuItems = getResourceMenuItems(isZh);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href={isZh ? '/zh' : '/'}>
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
          <div className="hidden md:flex md:items-center md:gap-x-4">
            <Link
              href={isZh ? '/zh/virtual-dataroom' : '/virtual-dataroom'}
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              {isZh ? '虚拟资料室' : 'Virtual Dataroom'}
            </Link>
            <Link href="/agents" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              {isZh ? 'AI 与自动化' : 'Agents'}
            </Link>
            <Link
              href={isZh ? '/zh/pricing' : '/pricing'}
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              {isZh ? '方案定价' : 'Pricing'}
            </Link>
            <NavDropdown title={isZh ? '功能特性' : 'Features'} href="/features" items={features} isZh={isZh} />
            <Link href="/blog" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              {isZh ? '博客' : 'Blog'}
            </Link>
            <ResourceDropdown title={isZh ? '资源' : 'Resources'} items={resourceMenuItems} />
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
            >
              {isZh ? '在线演示' : 'Live Demo'}
            </Link>
            <Link
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              {isZh ? '立即开始' : 'Get Started'}
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="-mr-2 flex items-center md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-500"
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
        <div className="md:hidden bg-white shadow-lg" id="mobile-menu">
          <div className="space-y-4 px-4 pb-4 pt-4">
            <div>
              <Link
                href={isZh ? '/zh/virtual-dataroom' : '/virtual-dataroom'}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                {isZh ? '虚拟资料室' : 'Virtual Dataroom'}
              </Link>
              <Link
                href="/agents"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                {isZh ? 'AI 与自动化' : 'Agents'}
              </Link>
              <Link
                href={isZh ? '/zh/pricing' : '/pricing'}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                {isZh ? '方案定价' : 'Pricing'}
              </Link>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">
                {isZh ? '功能特性' : 'Features'}
              </h3>
              <div className="mt-2 space-y-1">
                {features.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/features/${item.slug}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {(isZh && item.menuNameZh) ? item.menuNameZh : item.menuName}
                  </Link>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">
                {isZh ? '应用场景' : 'Use Cases'}
              </h3>
              <div className="mt-2 space-y-1">
                {solutions.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/solutions/${item.slug}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {item.menuName}
                  </Link>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4 space-y-1">
              <Link href="/blog" className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900">
                {isZh ? '博客' : 'Blog'}
              </Link>
              <Link
                href={isZh ? '/zh/about' : '/about'}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                {isZh ? '关于我们' : 'About'}
              </Link>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">
                {isZh ? '资源' : 'Resources'}
              </h3>
              <div className="mt-2 space-y-1">
                {resourceMenuItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4">
               <Link
                  href="/demo"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full text-center rounded-md border border-gray-300 px-4 py-2 text-base font-medium text-gray-900 shadow-sm hover:bg-gray-50"
                >
                  {isZh ? '在线演示' : 'Live Demo'}
                </Link>
               <Link
                  href={signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="mt-3 block w-full text-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-gray-800"
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
