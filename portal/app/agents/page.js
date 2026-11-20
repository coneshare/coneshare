import Link from 'next/link';
import { Play, ShieldCheck, HardDrive, Server } from 'lucide-react';
import { McpCodeCard } from '../../components/McpCodeCard';
import { AgentScreenshotsShowcase } from '../../components/AgentScreenshotsShowcase';
import { AgentVideoShowcase } from '../../components/AgentVideoShowcase';
import { AgentToolCatalog } from '../../components/AgentToolCatalog';
import { AgentsFaq } from '../../components/AgentsFaq';
import {
  DEFAULT_AGENT_VIDEO_POSTER,
  DEFAULT_AGENT_VIDEO_URL,
  TOTAL_MCP_TOOLS,
} from '../../lib/agentsData';

export const metadata = {
  title: 'ConeShare MCP | Use ChatGPT, Gemini & CLI Agents with Your Data Rooms',
  description:
    'Connect ChatGPT, Google Gemini, Claude.ai, or CLI agents to ConeShare over remote MCP. Group multiple AI conversations into separate Data Rooms to manage and share independently, and mint watermarked links for your files.',
  keywords: [
    'ChatGPT MCP server',
    'Gemini MCP connector',
    'Claude.ai MCP',
    'OAuth 2.1 MCP server',
    'share ChatGPT conversation securely',
    'save AI chat as document',
    'self hosted virtual dataroom MCP',
    'Model Context Protocol',
    'Claude Code MCP',
    'Codex MCP',
  ],
  alternates: {
    canonical: '/agents',
  },
};

const SECURITY_PILLARS = [
  {
    name: 'Approve what your AI can access',
    description:
      'When connecting a Web AI client, you sign in to ConeShare and choose read-only or read-write access. Destructive deletes, admin endpoints, and viewer PII stay blocked by default.',
    icon: ShieldCheck,
  },
  {
    name: 'Server-enforced link controls',
    description:
      'Email verification, passwords, NDA gates, expiration dates, and dynamic watermarks (PDF, Office, and images) are enforced server-side regardless of the prompt.',
    icon: Server,
  },
  {
    name: 'Self-hosted & storage-agnostic',
    description:
      'Keep your files in Nextcloud, Google Drive, Dropbox, or your own infrastructure. Saved AI memos and deal documents never leave your control.',
    icon: HardDrive,
  },
];

const EN_FAQS = [
  {
    question: 'How do I connect ChatGPT, Gemini, or Claude.ai?',
    answer:
      'Add https://app.coneshare.com/mcp/sse (or your self-hosted domain) as a custom MCP server in your AI client, then sign in to ConeShare and approve read-only or read-write access in your browser.',
  },
  {
    question: 'Why save and share AI conversations through ConeShare instead of default chat links?',
    answer:
      'Built-in AI chat sharing creates one isolated public link per conversation, with no way to organize threads or control access. In ConeShare, you can add multiple saved AI chats into separate Data Rooms, managing passwords, email verification, expiration dates, tracking, and share links independently for each room.',
  },
  {
    question: 'How do permissions differ between Web AI and CLI agents?',
    answer:
      'Web AI clients sign in via OAuth 2.1 and are limited to read-only or read-write access. Destructive deletes, file uploads, admin routes, and viewer PII analytics remain blocked. CLI and desktop agents (Claude Code, Codex, Cursor, Antigravity CLI) can use scoped API keys (read_only, read_write, or full_access).',
  },
  {
    question: 'Do I need to install a local MCP server?',
    answer:
      'No. ConeShare hosts a remote HTTPS MCP endpoint (/mcp/sse) for both ConeShare Cloud and self-hosted deployments. Connect directly over HTTPS without running local daemons.',
  },
  {
    question: 'Can an AI agent bypass watermarks or download restrictions?',
    answer:
      'No. Watermarks, NDA gates, passwords, and download locks are enforced server-side regardless of the prompt. Dynamic watermarks apply to PDF, Office, and image documents; Markdown and text documents support email verification, passwords, NDAs, expiration, and analytics.',
  },
];

export default function AgentsPage() {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'ConeShare MCP Server',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, macOS, Linux, Windows',
      url: 'https://coneshare.com/agents',
      description:
        'Remote Model Context Protocol (MCP) server for ChatGPT, Google Gemini, Claude.ai, and CLI agents to securely save, share, and track documents and Virtual Data Rooms.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: 'ChatGPT + ConeShare MCP Walkthrough',
      description:
        'Connect ChatGPT to ConeShare MCP and authorize access in your browser to create protected document links and organize AI conversations in separate Data Rooms.',
      thumbnailUrl: `https://coneshare.com${DEFAULT_AGENT_VIDEO_POSTER}`,
      contentUrl: DEFAULT_AGENT_VIDEO_URL,
      uploadDate: '2026-11-19',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: EN_FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ];

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Section 1: Hero + Real Screenshot Showcase */}
      <div className="bg-white">
        <div className="relative isolate px-6 pt-14 lg:px-8">
          <div
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, #d1d5db 1px, transparent 0)',
              backgroundSize: '20px 20px',
              maskImage: 'linear-gradient(to bottom, white, transparent)',
            }}
            aria-hidden="true"
          />

          <div className="pt-4 sm:pt-6 pb-16 sm:pb-20">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Connect ChatGPT, Gemini &amp; CLI Agents to Your Data Rooms
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
                Plug Web AI chats or terminal agents into ConeShare over remote MCP. Group multiple AI
                conversations into separate Data Rooms to manage and share independently, mint
                watermarked links for existing files, and keep everything on your own infrastructure.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
                <a
                  href="#setup"
                  className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  Connect Your AI
                </a>
                <a
                  href="#video-demo"
                  className="inline-flex items-center gap-2 text-sm font-semibold leading-6 text-gray-900 hover:text-gray-600 transition-colors group"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 group-hover:bg-gray-200 transition-colors">
                    <Play className="h-3 w-3 fill-gray-900 text-gray-900 ml-0.5" />
                  </span>
                  <span>Watch ChatGPT Demo</span>
                </a>
              </div>
            </div>

            <div className="mt-14 sm:mt-16 mx-auto max-w-5xl">
              <AgentScreenshotsShowcase locale="en" />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Video Walkthrough (ChatGPT Web + MCP) */}
      <div
        id="video-demo"
        className="border-y border-gray-200/80 bg-gray-50/70 py-20 sm:py-24 scroll-mt-16"
      >
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Walkthrough
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              See ChatGPT + ConeShare MCP in action
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600 max-w-2xl mx-auto">
              Sign in to ConeShare from ChatGPT to create protected links for your files, or group
              multiple AI conversations into separate Data Rooms to manage and share independently.
            </p>
          </div>

          <AgentVideoShowcase
            locale="en"
            videoUrl={DEFAULT_AGENT_VIDEO_URL}
            posterUrl={DEFAULT_AGENT_VIDEO_POSTER}
            title="ChatGPT + ConeShare MCP Walkthrough"
          />
        </div>
      </div>

      {/* Section 3: Quick Setup (Browser Authorization & CLI API Key) */}
      <div id="setup" className="bg-white py-20 sm:py-24 scroll-mt-16">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Setup</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Connect in under a minute
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              No local server or daemon required. Sign in to authorize browser-based AI apps, or
              paste a scoped API key into CLI and desktop clients.
            </p>
          </div>

          <McpCodeCard locale="en" />

          <dl className="mt-16 pt-14 border-t border-gray-200 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-3">
            {SECURITY_PILLARS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.name} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    <Icon className="h-5 w-5 flex-none text-gray-900" aria-hidden="true" />
                    {item.name}
                  </dt>
                  <dd className="mt-3 text-sm leading-6 text-gray-600">{item.description}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      {/* Section 4: 29 MCP Tools Catalog */}
      <div className="border-y border-gray-200/80 bg-gray-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="max-w-3xl mb-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              MCP Tools
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {TOTAL_MCP_TOOLS} tools across documents, Data Rooms, and links
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Everything your Web AI or CLI agent needs to save AI outputs, search Data Rooms, issue
              protected links, and inspect engagement.
            </p>
          </div>

          <AgentToolCatalog locale="en" />
        </div>
      </div>

      {/* Section 5: FAQ + Bottom CTA */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Frequently Asked Questions
            </h2>
          </div>
          <AgentsFaq locale="en" faqs={EN_FAQS} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Ready to connect your AI to ConeShare?
          </h2>
          <p className="mt-4 text-base text-gray-600">
            Start on ConeShare Cloud or self-host on your own server, and connect your AI clients in
            seconds.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="https://app.coneshare.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors"
            >
              Get Started Free
            </Link>
            <Link
              href="https://docs.coneshare.com/en/mcp-server/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-600 px-3 py-2"
            >
              Read MCP Documentation <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
