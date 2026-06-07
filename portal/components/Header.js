"use client";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { features, solutions, integrations } from '../lib/content';
import { ChevronDown, Menu, X } from 'lucide-react';

function NavDropdown({ title, href, items }) {
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
                {item.menuName}
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
}

const resources = [
  {
    key: 'about',
    name: 'About',
    href: '/about',
  },
  {
    key: 'docs',
    name: 'Docs',
    href: 'https://docs.coneshare.com/en/',
    external: true,
  },
  {
    key: 'forum',
    name: 'Forum',
    href: 'https://github.com/orgs/coneshare/discussions',
    external: true,
  },
  {
    key: 'contribute',
    name: 'Contribute',
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


export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const integrationMenuItems = [
    { type: 'group', key: 'self-hosted', label: 'Self-hosted' },
    integrations.find((item) => item.slug === 'nextcloud'),
    { type: 'group', key: 'cloud-divider', divider: true },
    { type: 'group', key: 'cloud', label: 'Cloud Storage' },
    integrations.find((item) => item.slug === 'google-drive'),
    integrations.find((item) => item.slug === 'dropbox'),
    { type: 'group', key: 'compare-divider', divider: true },
    { type: 'group', key: 'compare', label: 'Compare' },
    { slug: 'docsend', menuName: 'DocSend Alternative', isAlternative: true },
  ].filter(Boolean);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/">
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
            <Link href="/nextcloud-vdr" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Nextcloud VDR
            </Link>
            <NavDropdown title="Works with" href="/integrations" items={integrationMenuItems} />
            <NavDropdown title="Features" href="/features" items={features} />
            <Link href="/blog" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Blog
            </Link>
            <ResourceDropdown title="Resources" items={resources} />
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
            >
              Live Demo
            </Link>
            <Link
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              Get Started
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
                href="/nextcloud-vdr"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                Nextcloud VDR
              </Link>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Works with</h3>
              <div className="mt-2 space-y-1">
                {integrations
                  .filter((item) => item.slug === 'nextcloud')
                  .map((item) => (
                  <Link
                    key={item.slug}
                    href={`/integrations/${item.slug}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {item.menuName} <span className="text-xs text-gray-500">(Self-hosted)</span>
                  </Link>
                  ))}
                {integrations
                  .filter((item) => item.slug === 'google-drive' || item.slug === 'dropbox')
                  .map((item) => (
                    <Link
                      key={item.slug}
                      href={`/integrations/${item.slug}`}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      {item.menuName}
                    </Link>
                  ))}
                <Link
                  href="/alternatives/docsend"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                >
                  DocSend Alternative <span className="text-xs text-gray-500">(Compare)</span>
                </Link>
              </div>
            </div>
            <div>
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Features</h3>
              <div className="mt-2 space-y-1">
                {features.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/features/${item.slug}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {item.menuName}
                  </Link>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Use Cases</h3>
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
                Blog
              </Link>
              <Link
                href="/about"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                About
              </Link>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Resources</h3>
              <div className="mt-2 space-y-1">
                {resources.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
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
                  Live Demo
                </Link>
               <Link
                  href={signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="mt-3 block w-full text-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-gray-800"
                >
                  Get Started
                </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
