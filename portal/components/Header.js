"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { features, solutions } from '../lib/content';
import { ChevronDown } from 'lucide-react';

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


export function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="text-xl font-bold text-gray-800">
                Coneshare
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-x-4">
            <NavDropdown title="Features" href="/features" items={features} />
            <NavDropdown title="Solutions" href="/solutions" items={solutions} />
            <Link href="https://docs.coneshare.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Pricing
            </Link>
            <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-900">
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
