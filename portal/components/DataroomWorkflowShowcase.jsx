'use client';

import { useState, useId } from 'react';
import { Lock, MessageSquare, Palette, Activity } from 'lucide-react';
import { ZoomableImage } from './ZoomableImage';

const WORKFLOW_TABS = {
  en: [
    {
      id: 'permissions',
      label: 'Per-Link Permissions',
      icon: Lock,
      src: '/screenshots/feat-vdr-manage-perm.png',
      alt: 'Manage Visible, Download, and Watermark permissions per folder or file on a dataroom link',
      summary:
        'Issue multiple links for one room and toggle Visible, Download, and Watermark checkboxes per folder or file for each external party without duplicating documents.',
    },
    {
      id: 'qna',
      label: 'Private Q&A',
      icon: MessageSquare,
      src: '/screenshots/feat-vdr-qna.png',
      alt: 'Confidential link-isolated document Q&A panel inside a virtual dataroom',
      summary:
        'Keep questions anchored to specific files and isolated per shared link instead of losing context across long email chains.',
    },
    {
      id: 'branding',
      label: 'Portal & Indexing',
      icon: Palette,
      src: '/screenshots/feat-vdr-settings.png',
      alt: 'Dataroom branding settings with custom banners, logos, and file index numbers',
      summary:
        'Configure custom banners, room logos, featured resources, and optional document index numbers (01, #01) for a structured external portal.',
    },
    {
      id: 'sessions',
      label: 'Visitor Sessions',
      icon: Activity,
      src: '/screenshots/feat-visitor-sessions.png',
      alt: 'Visitor session audit log showing verified emails, viewed folders, dwell time, and downloads',
      summary:
        'See verified visitor identities, which link they opened, folder and document dwell time, and single-file or whole-room ZIP downloads.',
    },
  ],
  zh: [
    {
      id: 'permissions',
      label: '逐项权限矩阵',
      icon: Lock,
      src: '/screenshots/feat-vdr-manage-perm.png',
      alt: '针对单条资料室分享链接按目录或单文件勾选可见、下载与动态水印权限',
      summary:
        '同一个资料室可按不同协作方生成多条独立链接，分别勾选每个文件夹与文件的可见范围、下载控制及动态水印，无需复制多份底稿。',
    },
    {
      id: 'qna',
      label: '隔离文档问答',
      icon: MessageSquare,
      src: '/screenshots/feat-vdr-qna.png',
      alt: '按分享链接严格隔离的资料室文档内嵌问答面板',
      summary:
        '访客可直接针对具体文件发起提问，不同链接的提问彼此严格隔离，团队在统一后台集中回复并留存记录，告别零散邮件往返。',
    },
    {
      id: 'branding',
      label: '品牌门户与编号',
      icon: Palette,
      src: '/screenshots/feat-vdr-settings.png',
      alt: '资料室门户自定义横幅、Logo 与文件索引编号设置页面',
      summary:
        '独立设置单图或轮播横幅、专属 Logo、顶部推荐区与文件索引编号（01 / #01），对外呈现专业有序的交付门户。',
    },
    {
      id: 'sessions',
      label: '访客会话审计',
      icon: Activity,
      src: '/screenshots/feat-visitor-sessions.png',
      alt: '资料室访客会话审计明细，记录验证邮箱、浏览路径、停留时长与下载行为',
      summary:
        '清晰回溯每位访客的验证身份、访问来源链接、翻阅过的目录与文件停留秒数，以及单文件或整库打包下载记录。',
    },
  ],
};

export function DataroomWorkflowShowcase({ locale = 'en' }) {
  const isZh = locale === 'zh';
  const tabs = isZh ? WORKFLOW_TABS.zh : WORKFLOW_TABS.en;
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();

  const currentTab = tabs[activeIndex] || tabs[0];

  const handleKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      document.getElementById(`${baseId}-tab-${tabs[nextIndex].id}`)?.focus();
    }
  };

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label={isZh ? '虚拟资料室核心场景切换' : 'Virtual dataroom workflow views'}
        className="flex flex-wrap items-center justify-center gap-2 sm:gap-3"
      >
        {tabs.map((tab, idx) => {
          const Icon = tab.icon;
          const isSelected = idx === activeIndex;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setActiveIndex(idx)}
              onKeyDown={(event) => handleKeyDown(event, idx)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${currentTab.id}`}
        className="mt-8 rounded-2xl border border-gray-200 bg-white p-2 sm:p-3 shadow-xl"
      >
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
          <ZoomableImage
            src={currentTab.src}
            alt={currentTab.alt}
            width={1440}
            height={900}
            className="w-full h-auto max-h-[540px] object-contain mx-auto"
          />
        </div>
        <div className="px-3 py-3 border-t border-gray-100 mt-2">
          <p className="text-sm text-gray-600 leading-relaxed">{currentTab.summary}</p>
        </div>
      </div>
    </div>
  );
}
