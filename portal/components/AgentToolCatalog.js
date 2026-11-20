'use client';

import { useState } from 'react';
import { getToolCategories } from '../lib/agentsData';

export function AgentToolCatalog({ locale = 'en' }) {
  const isZh = locale === 'zh';
  const categories = getToolCategories(locale);
  const [activeTab, setActiveTab] = useState(categories[0].id);

  const visibleCategories = categories.filter((cat) => cat.id === activeTab);

  return (
    <div>
      {/* Clean Underline/Monochrome Category Tabs */}
      <div
        role="tablist"
        aria-label={isZh ? 'MCP 工具分类' : 'MCP tool categories'}
        className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6"
      >
        {categories.map((cat) => {
          const isActive = activeTab === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(cat.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {cat.name}{' '}
              <span className={isActive ? 'text-gray-300' : 'text-gray-400'}>
                ({cat.tools.length})
              </span>
            </button>
          );
        })}
      </div>

      {/* Tool Lists */}
      <div className="space-y-6">
        {visibleCategories.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/70 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-900">{cat.name}</h3>
              <span className="text-xs text-gray-500">
                {isZh ? `${cat.tools.length} 个工具` : `${cat.tools.length} tools`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-gray-100">
              {cat.tools.map((tool) => (
                <div key={tool.name} className="bg-white p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="font-mono text-xs font-semibold text-gray-900">
                      {tool.name}()
                    </code>
                    {tool.apiKeyOnly && (
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {isZh ? '仅限 API Key' : 'API key only'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-600 leading-5">{tool.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-500">
        {isZh ? (
          <>
            网页端 AI 仅按你在 ConeShare 登录授权的只读或读写权限（<code className="font-mono">read</code> /{' '}
            <code className="font-mono">write</code>）工作；删除操作、访客隐私分析与组织管理接口需使用受控 API Key。
          </>
        ) : (
          <>
            Web AI clients only receive the read-only or read-write access (<code className="font-mono">read</code> /{' '}
            <code className="font-mono">write</code>) you approve when signing in to ConeShare. Destructive deletes, file uploads, viewer analytics, and
            admin tools require a scoped API key.
          </>
        )}
      </p>
    </div>
  );
}
