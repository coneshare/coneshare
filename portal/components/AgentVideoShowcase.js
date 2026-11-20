'use client';

import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { DEFAULT_AGENT_VIDEO_POSTER, DEFAULT_AGENT_VIDEO_URL } from '../lib/agentsData';

const HIGHLIGHTS_BY_LOCALE = {
  en: [
    {
      number: '1',
      title: 'Sign in to authorize ChatGPT',
      description:
        'Paste the ConeShare MCP URL and approve read-only or read-write access directly in your browser.',
    },
    {
      number: '2',
      title: 'Create protected document links',
      description:
        'Find existing files from chat and mint links with email gates, passwords, expiry, or PDF watermarks.',
    },
    {
      number: '3',
      title: 'Organize & share chats by Data Room',
      description:
        'Save multiple AI conversations into separate Data Rooms, manage permissions per project, and share each room independently.',
    },
  ],
  zh: [
    {
      number: '1',
      title: '登录 ConeShare 授权 ChatGPT 访问',
      description: '填入 ConeShare MCP 地址，在弹出的浏览器页面登录并确认只读或读写权限。',
    },
    {
      number: '2',
      title: '在对话中直接生成受控文档链接',
      description: '检索工作区现有文件，生成带邮箱验证、密码、有效期或 PDF 水印的外发链接。',
    },
    {
      number: '3',
      title: '多条对话按资料室归档和分享',
      description: '把多条 ChatGPT 聊天记录保存后放进各自资料室，按项目独立管理权限并分享出去。',
    },
  ],
};

export function AgentVideoShowcase({
  locale = 'en',
  videoUrl = DEFAULT_AGENT_VIDEO_URL,
  posterUrl = DEFAULT_AGENT_VIDEO_POSTER,
  title,
}) {
  const isZh = locale === 'zh';
  const resolvedTitle =
    title || (isZh ? 'ChatGPT + ConeShare MCP 演示视频' : 'ChatGPT + ConeShare MCP Walkthrough');
  const highlights = isZh ? HIGHLIGHTS_BY_LOCALE.zh : HIGHLIGHTS_BY_LOCALE.en;

  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const handleStartPlay = () => {
    setIsPlaying(true);
    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  };

  return (
    <div>
      {/* Clean 16:9 Inline Video Frame */}
      <div className="rounded-2xl border border-gray-200 bg-black shadow-xl overflow-hidden">
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl}
            controls={isPlaying}
            preload="metadata"
            playsInline
            onPlay={() => setIsPlaying(true)}
            onEnded={() => setIsPlaying(false)}
            className="h-full w-full object-contain"
          >
            Your browser does not support the video tag.
          </video>

          {!isPlaying && (
            <button
              type="button"
              onClick={handleStartPlay}
              aria-label={isZh ? `播放视频：${resolvedTitle}` : `Play video: ${resolvedTitle}`}
              className="absolute inset-0 cursor-pointer group flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900"
            >
              {posterUrl && (
                <img
                  src={posterUrl}
                  alt={isZh ? `${resolvedTitle} 封面` : `${resolvedTitle} poster`}
                  className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                />
              )}
              <span className="absolute bottom-6 z-10 inline-flex items-center gap-2 rounded-full bg-gray-900/90 backdrop-blur-md border border-white/15 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xl transition-transform duration-200 group-hover:scale-105">
                <Play className="h-3.5 w-3.5 fill-white text-white ml-0.5" />
                <span>{isZh ? '点击播放演示视频' : 'Play walkthrough'}</span>
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 3 Simple Numbered Highlights */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {highlights.map((item) => (
          <div
            key={item.number}
            className="rounded-lg border border-gray-200/80 bg-white p-5 shadow-sm"
          >
            <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">
                {item.number}
              </span>
              <span>{item.title}</span>
            </h3>
            <p className="mt-2 text-sm text-gray-600 leading-6">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
