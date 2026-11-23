'use client';

import { useState, useId } from 'react';
import Link from 'next/link';
import { ChevronDown, Copy, Check, Search } from 'lucide-react';
import {
  METHOD_BADGE_CLASSES,
  TIER_LABELS,
  buildCodeSnippet,
  filterApiCategories,
} from '../lib/api-reference-utils';

const COPY = {
  en: {
    title: 'Coneshare REST API Reference',
    subtitle:
      'Build integrations on top of Coneshare documents, datarooms, share links, analytics, file requests, and webhooks using API keys.',
    mcpLinkText: 'Prefer AI tool integration? Explore Remote MCP',
    mcpHref: '/agents',
    versionLabel: 'API Version',
    baseUrlTitle: 'Base URL',
    baseUrlNote: 'For self-hosted instances, replace with your configured SITE_DOMAIN.',
    tiersTitle: 'API Key Scope Tiers',
    tiers: [
      { name: 'read_only', desc: 'Allows GET, HEAD, and OPTIONS read endpoints across your workspace.' },
      { name: 'read_write', desc: 'Adds POST, PUT, and PATCH resource creation and updates.' },
      { name: 'full_access', desc: 'Adds DELETE operations, dataroom removals, ownership transfers, and API key management.' },
    ],
    categoriesNavLabel: 'API categories',
    allCategories: 'All Endpoints',
    searchPlaceholder: 'Filter by path, method, or summary...',
    noMatches: 'No endpoints matched your filter.',
    parametersHeading: 'Parameters',
    bodyHeading: 'Request Body Fields',
    responsesHeading: 'Responses',
    exampleHeading: 'Request Example',
    required: 'required',
    copy: 'Copy',
    copied: 'Copied',
    colName: 'Name',
    colIn: 'In',
    colType: 'Type',
    colDescription: 'Description',
  },
  zh: {
    title: 'Coneshare REST API 参考文档',
    subtitle:
      '基于 API Key 将 Coneshare 的文档管理、虚拟资料室、安全分享链接、阅读分析、文件收集与 Webhook 自动化接入你的业务系统。',
    mcpLinkText: '需要接入 ChatGPT / Gemini / Claude？查看远程 MCP',
    mcpHref: '/zh/agents',
    versionLabel: 'API 版本',
    baseUrlTitle: '基础请求地址 (Base URL)',
    baseUrlNote: '私有化部署实例请替换为你的 SITE_DOMAIN 域名。',
    tiersTitle: 'API Key 权限分级',
    tiers: [
      { name: 'read_only', desc: '允许调用 GET / HEAD / OPTIONS 只读查询接口。' },
      { name: 'read_write', desc: '额外允许 POST / PUT / PATCH 创建与更新操作。' },
      { name: 'full_access', desc: '包含 DELETE 删除、资料室移除/所有权转让以及 API Key 管理接口。' },
    ],
    categoriesNavLabel: 'API 分类目录',
    allCategories: '全部接口',
    searchPlaceholder: '搜索路径、请求方法或接口说明...',
    noMatches: '未找到匹配的 API 接口。',
    parametersHeading: '请求参数',
    bodyHeading: '请求体字段 (JSON)',
    responsesHeading: '响应状态码',
    exampleHeading: '调用示例',
    required: '必填',
    copy: '复制',
    copied: '已复制',
    colName: '字段',
    colIn: '位置',
    colType: '类型',
    colDescription: '说明',
  },
};

function CopyButton({ text, labelCopy, labelCopied }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{copied ? labelCopied : labelCopy}</span>
    </button>
  );
}

function EndpointCard({ endpoint, baseUrl, isZh, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [snippetLang, setSnippetLang] = useState('curl');
  const panelId = useId();
  const t = isZh ? COPY.zh : COPY.en;
  const tierMap = isZh ? TIER_LABELS.zh : TIER_LABELS.en;
  const methodClass = METHOD_BADGE_CLASSES[endpoint.method] || METHOD_BADGE_CLASSES.GET;
  const snippet = isOpen ? buildCodeSnippet(endpoint, baseUrl, snippetLang) : '';

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-gray-900"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-semibold ${methodClass}`}
            >
              {endpoint.method}
            </span>
            <code className="break-all font-mono text-sm font-semibold text-gray-900">
              {endpoint.path}
            </code>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] font-medium text-gray-600">
              {tierMap[endpoint.tierHint] || endpoint.tierHint}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-gray-600">{endpoint.summary}</p>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 motion-reduce:transition-none ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div id={panelId} className="border-t border-gray-200 bg-gray-50/50 px-5 py-5 space-y-6">
          {endpoint.description && (
            <p className="text-sm leading-6 text-gray-700">{endpoint.description}</p>
          )}

          {endpoint.parameters?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.parametersHeading}
              </h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colName}</th>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colIn}</th>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colType}</th>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colDescription}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {endpoint.parameters.map((param) => (
                      <tr key={`${param.in}-${param.name}`}>
                        <td className="px-3.5 py-2.5 font-mono font-medium text-gray-900">
                          {param.name}
                          {param.required && (
                            <span className="ml-1.5 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-sans font-semibold text-white">
                              {t.required}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-gray-600">{param.in}</td>
                        <td className="px-3.5 py-2.5 font-mono text-gray-600">{param.type}</td>
                        <td className="px-3.5 py-2.5 text-gray-600">{param.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {endpoint.requestBodyFields?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.bodyHeading}
              </h4>
              <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colName}</th>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colType}</th>
                      <th scope="col" className="px-3.5 py-2 font-semibold">{t.colDescription}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {endpoint.requestBodyFields.map((field) => (
                      <tr key={field.name}>
                        <td className="px-3.5 py-2.5 font-mono font-medium text-gray-900">
                          {field.name}
                          {field.required && (
                            <span className="ml-1.5 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-sans font-semibold text-white">
                              {t.required}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-gray-600">{field.type}</td>
                        <td className="px-3.5 py-2.5 text-gray-600">{field.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.exampleHeading}
              </h4>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-xs">
                  {[
                    { id: 'curl', label: 'cURL' },
                    { id: 'javascript', label: 'JavaScript' },
                    { id: 'python', label: 'Python' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSnippetLang(tab.id)}
                      className={`rounded px-2.5 py-1 font-medium transition-colors ${
                        snippetLang === tab.id
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-2 overflow-hidden rounded-xl bg-gray-900 text-gray-100">
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2 text-xs text-gray-400">
                <span className="font-mono">{endpoint.method} {endpoint.path}</span>
                <CopyButton text={snippet} labelCopy={t.copy} labelCopied={t.copied} />
              </div>
              <pre className="overflow-x-auto p-4 text-xs leading-6">
                <code>{snippet}</code>
              </pre>
            </div>
          </div>

          {endpoint.responses?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.responsesHeading}
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {endpoint.responses.map((resp) => (
                  <span
                    key={resp.status}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700"
                  >
                    <strong className="font-mono text-gray-900">{resp.status}</strong>
                    {resp.description && resp.description !== 'Response' && (
                      <span>{resp.description}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiReferenceClient({ catalog, locale = 'en' }) {
  const isZh = locale === 'zh';
  const t = isZh ? COPY.zh : COPY.en;
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputId = useId();

  const categories = catalog?.categories || [];
  const visibleCategories = filterApiCategories(categories, selectedCategory, searchQuery);

  return (
    <div className="bg-white">
      {/* Header Band */}
      <section className="border-b border-gray-200 bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {t.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">{t.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={t.mcpHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                <span>{t.mcpLinkText}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {/* Auth & Tier Overview Grid */}
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.baseUrlTitle}
              </p>
              <p className="mt-2.5 font-mono text-sm font-semibold text-gray-900">
                {catalog.baseUrl}
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-600">{t.baseUrlNote}</p>
              <div className="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-600">
                <span>
                  {t.versionLabel}: <strong className="text-gray-900">v{catalog.version}</strong>
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t.tiersTitle}
              </p>
              <ul className="mt-2.5 space-y-2 text-xs leading-5 text-gray-600">
                {t.tiers.map((tier) => (
                  <li key={tier.name}>
                    <code className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold text-gray-900 border border-gray-200">
                      {tier.name}
                    </code>{' '}
                    <span>{tier.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Reference Body */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
            {/* Left Category Sidebar */}
            <aside className="lg:w-64 lg:shrink-0 lg:sticky lg:top-24">
              <nav aria-label={t.categoriesNavLabel} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  aria-current={selectedCategory === 'all' ? 'true' : undefined}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-gray-100 font-semibold text-gray-900 ring-1 ring-inset ring-gray-300'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span>{t.allCategories}</span>
                  <span className="font-mono text-xs text-gray-500">{catalog.totalOperations}</span>
                </button>
                {categories.map((cat) => {
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-gray-100 font-semibold text-gray-900 ring-1 ring-inset ring-gray-300'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <span className="truncate">{isZh ? cat.titleZh : cat.titleEn}</span>
                      <span className="ml-2 shrink-0 font-mono text-xs text-gray-500">
                        {cat.endpoints.length}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Right Endpoint Explorer */}
            <main className="min-w-0 flex-1 space-y-10">
              <div className="relative">
                <label htmlFor={searchInputId} className="sr-only">
                  {t.searchPlaceholder}
                </label>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  id={searchInputId}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </div>

              {visibleCategories.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-600">
                  {t.noMatches}
                </div>
              ) : (
                visibleCategories.map((cat, catIdx) => (
                  <section key={cat.id} id={cat.id} className="scroll-mt-24 space-y-4">
                    <div className="border-b border-gray-200 pb-3">
                      <h2 className="text-xl font-bold tracking-tight text-gray-900">
                        {isZh ? cat.titleZh : cat.titleEn}
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        {isZh ? cat.descriptionZh : cat.descriptionEn}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {cat.endpoints.map((ep, epIdx) => (
                        <EndpointCard
                          key={ep.id}
                          endpoint={ep}
                          baseUrl={catalog.baseUrl}
                          isZh={isZh}
                          defaultOpen={catIdx === 0 && epIdx === 0}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </main>
          </div>
        </div>
      </section>
    </div>
  );
}
