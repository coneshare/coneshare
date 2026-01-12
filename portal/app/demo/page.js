"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';

export default function DemoPage() {
  const [copied, setCopied] = useState('');

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const demoUrl = 'https://app.coneshare.com';
  const demoEmail = 'demo@coneshare.com';
  const demoPassword = 'demo';

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-gray-900">Live Demo</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Explore Coneshare Today
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Use the credentials below to access our live, shared demo environment. Please note that all data is public and the environment is reset periodically.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-xl">
          <div className="space-y-6 rounded-lg border bg-gray-50/50 p-8 shadow-sm">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">URL</label>
              <div className="flex items-center">
                <p className="flex-grow rounded-md border bg-white px-3 py-2 text-gray-900 shadow-sm">
                  <Link href={demoUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {demoUrl}
                  </Link>
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Email Address</label>
              <div className="flex items-center gap-x-2">
                <p className="flex-grow rounded-md border bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm">{demoEmail}</p>
                <button
                  onClick={() => handleCopy(demoEmail, 'email')}
                  className="rounded-md p-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  aria-label="Copy email address"
                >
                  {copied === 'email' ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5 text-gray-500" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="flex items-center gap-x-2">
                <p className="flex-grow rounded-md border bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm">{demoPassword}</p>
                <button
                  onClick={() => handleCopy(demoPassword, 'password')}
                  className="rounded-md p-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  aria-label="Copy password"
                >
                  {copied === 'password' ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5 text-gray-500" />}
                </button>
              </div>
            </div>
            <div className="pt-4">
              <Link
                href={demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-md border border-transparent bg-gray-900 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-gray-800"
              >
                Launch Demo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
