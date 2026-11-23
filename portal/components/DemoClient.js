"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';

const DEMO_URL = 'https://app.coneshare.com';
const SIGNUP_URL = 'https://app.coneshare.com/signup';
const DEMO_EMAIL = 'demo@coneshare.com';
const DEMO_PASSWORD = 'demo';

const COPY = {
  en: {
    title: 'Explore Real-Time Signals in Coneshare',
    subtitle:
      'Use the credentials below to test activity tracking and automation workflows in our live shared environment. All data in this shared account is public and reset periodically—please do not upload sensitive files here, and create your own account if you want to test with confidential documents.',
    urlLabel: 'URL',
    emailLabel: 'Email Address',
    copyEmailAria: 'Copy email address',
    passwordLabel: 'Password',
    copyPasswordAria: 'Copy password',
    launchCta: 'Launch Demo',
    createAccountCta: 'Create your own account',
  },
  zh: {
    title: '体验 Coneshare 在线演示',
    subtitle:
      '使用下方公共账号登录，实测文档权限控制、动态水印、阅读追踪与自动化工作流。公共演示数据会定期自动重置且公开可见，请勿上传敏感文件；如需使用敏感数据测试，请创建自己的账号体验。',
    urlLabel: '访问地址 (URL)',
    emailLabel: '演示邮箱',
    copyEmailAria: '复制演示邮箱',
    passwordLabel: '登录密码',
    copyPasswordAria: '复制登录密码',
    launchCta: '打开在线演示',
    createAccountCta: '免费创建独立账号',
  },
};

export default function DemoClient({ locale = 'en' }) {
  const [copied, setCopied] = useState('');
  const t = COPY[locale] || COPY.en;

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t.title}
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">{t.subtitle}</p>
        </div>
        <div className="mx-auto mt-16 max-w-xl">
          <div className="space-y-6 rounded-lg border bg-gray-50/50 p-8 shadow-sm">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t.urlLabel}</label>
              <div className="flex items-center">
                <p className="flex-grow rounded-md border bg-white px-3 py-2 text-gray-900 shadow-sm">
                  <Link href={DEMO_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {DEMO_URL}
                  </Link>
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t.emailLabel}</label>
              <div className="flex items-center gap-x-2">
                <p className="flex-grow rounded-md border bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm">
                  {DEMO_EMAIL}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(DEMO_EMAIL, 'email')}
                  className="rounded-md p-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  aria-label={t.copyEmailAria}
                >
                  {copied === 'email' ? (
                    <Check className="h-5 w-5 text-green-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-5 w-5 text-gray-500" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t.passwordLabel}</label>
              <div className="flex items-center gap-x-2">
                <p className="flex-grow rounded-md border bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-sm">
                  {DEMO_PASSWORD}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(DEMO_PASSWORD, 'password')}
                  className="rounded-md p-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  aria-label={t.copyPasswordAria}
                >
                  {copied === 'password' ? (
                    <Check className="h-5 w-5 text-green-600" aria-hidden="true" />
                  ) : (
                    <Copy className="h-5 w-5 text-gray-500" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <div className="pt-4">
              <Link
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-md border border-transparent bg-gray-900 px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-gray-800"
              >
                {t.launchCta}
              </Link>
            </div>
            <div className="border-t border-gray-200 pt-5 text-center text-sm">
              <Link
                href={SIGNUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-gray-900 hover:text-gray-700"
              >
                {t.createAccountCta}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
