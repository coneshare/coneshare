"use client";

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    question: "What is Coneshare for agents?",
    answer:
      "Coneshare for agents exposes your Virtual Data Room and secure document sharing platform to AI agents via the Model Context Protocol (MCP) and a REST API. Agents can autonomously create datarooms, upload documents, generate watermarked share links, and query page-by-page viewing analytics while inheriting all organizational security policies.",
  },
  {
    question: "Do I need to install or run a local MCP daemon?",
    answer:
      "No. Coneshare operates a remote, network-based MCP server using the streamable-http (SSE) transport protocol. You simply point your AI client (such as Claude Desktop, Codex, or Antigravity CLI) to the remote endpoint (e.g. https://app.coneshare.com/mcp/sse) with your API key header. No local daemons or Python runtimes are required.",
  },
  {
    question: "How does authentication and permission scoping work?",
    answer:
      "Every MCP tool call requires a scoped Bearer API token (`cs_live_...`) passed in the Authorization header. Token permissions (`read_only`, `read_write`, `full_access`) are strictly validated on every request. An agent can only access or modify resources owned by the token's user account.",
  },
  {
    question: "Can an AI agent accidentally bypass watermarks or download restrictions?",
    answer:
      "No. Security guardrails are enforced server-side by Coneshare's backend. When dynamic watermarking, NDA gates, or download restrictions are configured on a dataroom or share link, all document renders and exports are automatically watermarked and restricted before leaving the server—regardless of how the agent is prompted.",
  },
  {
    question: "What analytics can agents retrieve?",
    answer:
      "Agents can call analytics tools to inspect total view sessions, individual viewer emails, dwell time per page, and video playback segments (including muted/unmuted playback and watch duration). This lets agents automatically score buyer intent and trigger timely follow-ups.",
  },
  {
    question: "Can we build custom internal agents using the REST API?",
    answer:
      "Yes. Every MCP tool directly maps to Coneshare's versioned REST API (`/api/v1/`). You can write custom Python, TypeScript, or Go agents and trigger workflows via webhooks when links are opened or documents are viewed.",
  },
];

export function AgentsFaq() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (idx) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <div className="divide-y divide-gray-200 border-y border-gray-200">
      {FAQS.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={faq.question} className="py-6">
            <button
              onClick={() => toggle(idx)}
              className="flex w-full items-start justify-between text-left text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900 rounded-sm"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold leading-7">{faq.question}</span>
              <span className="ml-6 flex h-7 items-center">
                <ChevronDown
                  className={`h-5 w-5 transform text-gray-500 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-gray-900' : ''
                  }`}
                />
              </span>
            </button>
            {isOpen && (
              <div className="mt-3 pr-12 text-sm leading-6 text-gray-600">
                <p>{faq.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
