"use client";

import { useState } from 'react';
import { Check, Copy, Sparkles, Download } from 'lucide-react';

const SKILL_INSTALL_CMD = `mkdir -p .agent/skills/coneshare-it && \\
curl -fsSL https://raw.githubusercontent.com/coneshare/coneshare/main/.agent/skills/coneshare-it/SKILL.md \\
  -o .agent/skills/coneshare-it/SKILL.md`;

const TABS = [
  {
    id: 'install_curl',
    label: '1-Line Install',
    icon: Download,
    filename: 'terminal',
    language: 'bash',
    code: SKILL_INSTALL_CMD,
    hint: 'Run in your project root. Works with Antigravity, Claude Code, and skill-aware agents.',
  },
  {
    id: 'prompts',
    label: 'Chat Prompts',
    icon: Sparkles,
    filename: 'example-prompts.txt',
    language: 'text',
    code: `# 1. Single File Sharing:
/coneshare-it upload ./contract_draft.pdf and give me a share link

# 2. Multi-File Dataroom Bundling:
/coneshare-it bundle all files in ./fundraise_diligence into 'Series A Diligence'

# 3. View Analytics & Dwell Time:
/coneshare-it who viewed my pitch deck in the last 24 hours?

# 4. Natural Language Invocation:
"Use the coneshare-it skill to upload ./Pitch_Deck.pdf and generate an email-verified link with dynamic watermark."`,
    hint: 'Execute directly via /coneshare-it or natural language prompts.',
  },
];

export function SkillCodeCard() {
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const [copied, setCopied] = useState(false);

  const activeSnippet = TABS.find((t) => t.id === activeTab) || TABS[0];

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
    <div className="rounded-xl border border-gray-700 bg-gray-950 text-slate-200 shadow-2xl overflow-hidden font-mono text-xs">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-800 bg-gray-900/90 px-3 py-2 gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white shadow-sm border border-gray-700'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-500 hidden sm:inline">{activeSnippet.filename}</span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors border border-gray-700"
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
      <div className="p-4 sm:p-5 overflow-x-auto text-xs leading-relaxed max-h-80 overflow-y-auto">
        <pre className="text-emerald-400 font-mono">
          <code>{activeSnippet.code}</code>
        </pre>
      </div>

      {/* Footer Hint */}
      <div className="border-t border-gray-800 bg-gray-900/60 px-4 py-2 text-[11px] text-gray-400 flex items-center justify-between">
        <span>{activeSnippet.hint}</span>
        <span className="text-gray-500 font-mono">v1.0.0</span>
      </div>
    </div>
  );
}
