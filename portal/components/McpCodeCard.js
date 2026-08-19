"use client";

import { useState } from 'react';
import { Check, Copy, Terminal, Laptop, Code2, Sparkles, Command } from 'lucide-react';

const JSON_CONFIG = `{
  "mcpServers": {
    "coneshare": {
      "url": "https://app.coneshare.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer cs_live_YOUR_API_KEY"
      }
    }
  }
}`;

const SNIPPETS = [
  {
    id: 'claude_desktop',
    label: 'Claude Desktop',
    icon: Laptop,
    filename: 'claude_desktop_config.json',
    language: 'json',
    code: JSON_CONFIG,
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    icon: Terminal,
    filename: 'terminal',
    language: 'bash',
    code: `claude mcp add --transport sse coneshare https://app.coneshare.com/mcp/sse --header "Authorization: Bearer cs_live_YOUR_API_KEY"`,
  },
  {
    id: 'agy',
    label: 'Antigravity (agy)',
    icon: Command,
    filename: 'mcp_config.json',
    language: 'json',
    code: JSON_CONFIG,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: Code2,
    filename: '.cursor/mcp.json',
    language: 'json',
    code: JSON_CONFIG,
  },
  {
    id: 'vscode',
    label: 'VS Code',
    icon: Code2,
    filename: '.vscode/mcp.json',
    language: 'json',
    code: JSON_CONFIG,
  },
  {
    id: 'codex',
    label: 'Codex',
    icon: Terminal,
    filename: '~/.codex/config.json',
    language: 'json',
    code: JSON_CONFIG,
  },
  {
    id: 'prompt',
    label: 'Agent Prompt',
    icon: Sparkles,
    filename: 'chat-prompt',
    language: 'text',
    code: `"Create a Series A data room called 'Acme Diligence', upload all PDFs from ~/pitch/, and mint an email-verified link with dynamic watermarking for each investor on the deal list."`,
  },
];

export function McpCodeCard() {
  const [activeTab, setActiveTab] = useState(SNIPPETS[0].id);
  const [copied, setCopied] = useState(false);

  const activeSnippet = SNIPPETS.find((s) => s.id === activeTab) || SNIPPETS[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0F172A] text-slate-200 shadow-2xl overflow-hidden font-mono text-sm">
      {/* Card Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-800 bg-[#090D16] px-4 py-2 gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {SNIPPETS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white shadow-sm border border-gray-700'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:inline">{activeSnippet.filename}</span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors border border-gray-700"
            title="Copy snippet"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Display Area */}
      <div className="p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm leading-relaxed">
        <pre className="text-emerald-400">
          <code>{activeSnippet.code}</code>
        </pre>
      </div>

      {/* Bottom Hint */}
      <div className="border-t border-gray-800/80 bg-[#090D16]/50 px-4 py-2.5 text-xs text-gray-400 flex items-center justify-between">
        <span>⚡ Remote Streamable-HTTP Protocol · No local daemon required</span>
        <span className="text-gray-500">HTTPS / SSE</span>
      </div>
    </div>
  );
}
