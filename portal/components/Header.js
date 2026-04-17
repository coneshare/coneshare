"use client";

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { features, solutions } from '../lib/content';
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
            <Link
              key={item.slug}
              href={`${href}/${item.slug}`}
              onClick={() => setIsOpen(false)}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.menuName}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const resources = [
  {
    key: 'docs',
    name: 'Docs',
    href: 'https://docs.coneshare.com/en/',
  },
  {
    key: 'forum',
    name: 'Forum',
    href: 'https://github.com/orgs/coneshare/discussions',
  },
  {
    key: 'contribute',
    name: 'Contribute',
    href: 'https://github.com/coneshare/coneshare',
  },
];

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
              target="_blank"
              rel="noopener noreferrer"
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
            <NavDropdown title="Features" href="/features" items={features} />
            <NavDropdown title="Use Cases" href="/solutions" items={solutions} />
            <Link href="/blog" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Blog
            </Link>
            <ResourceDropdown title="Resources" items={resources} />
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              Request Demo
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
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="px-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Resources</h3>
              <div className="mt-2 space-y-1">
                {resources.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
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
                  className="block w-full text-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-gray-800"
                >
                  Request Demo
                </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
