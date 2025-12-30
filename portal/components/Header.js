import Link from 'next/link';
import { features, solutions } from '../lib/content';
import { ChevronDown } from 'lucide-react';

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
            <div className="relative group -my-2 py-2">
              <Link href="/features" className="text-sm font-medium text-gray-500 hover:text-gray-900 inline-flex items-center gap-x-1">
                <span>Features</span>
                <ChevronDown className="h-4 w-4" />
              </Link>
              <div className="absolute left-1/2 -translate-x-1/2 hidden group-hover:block bg-white shadow-lg rounded-lg mt-2 py-2 w-80 z-10 ring-1 ring-black ring-opacity-5">
                {features.map((feature) => (
                  <Link
                    key={feature.slug}
                    href={`/features/${feature.slug}`}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {feature.menuName}
                  </Link>
                ))}
              </div>
            </div>
            <div className="relative group -my-2 py-2">
              <Link href="/solutions" className="text-sm font-medium text-gray-500 hover:text-gray-900 inline-flex items-center gap-x-1">
                <span>Solutions</span>
                <ChevronDown className="h-4 w-4" />
              </Link>
              <div className="absolute left-1/2 -translate-x-1/2 hidden group-hover:block bg-white shadow-lg rounded-lg mt-2 py-2 w-80 z-10 ring-1 ring-black ring-opacity-5">
                {solutions.map((solution) => (
                  <Link
                    key={solution.slug}
                    href={`/solutions/${solution.slug}`}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {solution.menuName}
                  </Link>
                ))}
              </div>
            </div>
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
