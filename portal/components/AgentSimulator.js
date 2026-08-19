"use client";

import { useState } from 'react';
import { Bot, Shield, CheckCircle2, ArrowRight, HardDrive, Terminal, Droplets, Sparkles, Activity } from 'lucide-react';

const SIMULATION_SCENARIOS = [
  {
    id: 'fundraise',
    title: 'Series A VC Distribution',
    badge: 'Fundraising',
    prompt:
      '"Sync pitch deck from Nextcloud folder /pitch-v2, apply dynamic email watermarking, and mint a 14-day expiring link with NDA gate for sequoia.com."',
    steps: [
      {
        type: 'agent',
        title: 'Agent Tool Invocation',
        detail: 'Calling list_documents() & create_share_link() via MCP SSE stream.',
        code: 'create_share_link(document_id="doc_01J9...", requires_email=True, enable_watermark=True, require_nda=True, expires_in_days=14)',
        icon: Terminal,
      },
      {
        type: 'guard',
        title: 'Sovereign Storage & Security Gate',
        detail: 'Syncs file hash from private Nextcloud storage. Stamping viewer watermark on preview engine.',
        badge: 'Zero Vendor Lock-in',
        icon: Shield,
      },
      {
        type: 'output',
        title: 'Active Sovereign Link Minted',
        detail: 'https://app.coneshare.com/s/sequoia-vdr-01j9 (NDA + Watermarked)',
        badge: 'Status: 200 OK',
        icon: CheckCircle2,
      },
      {
        type: 'telemetry',
        title: 'Live Telemetry & Intent Scoring',
        detail: 'Partner partner@sequoia.com viewed 8/12 pages · Spent 2m 45s on slide 4 (Financials).',
        badge: 'High Intent Signal',
        icon: Activity,
      },
    ],
  },
  {
    id: 'mna',
    title: 'M&A Diligence Screening',
    badge: 'Due Diligence',
    prompt:
      '"Create a private dataroom for Project Apex, upload CIM and financial audit models, enforce dynamic watermarks, and disable downloads."',
    steps: [
      {
        type: 'agent',
        title: 'Agent Tool Invocation',
        detail: 'Calling create_dataroom() and request_document_upload() with pre-signed chunked storage URL.',
        code: 'create_dataroom(name="Project Apex Diligence") -> request_document_upload(file_name="CIM.pdf", file_size=14829100)',
        icon: Terminal,
      },
      {
        type: 'guard',
        title: 'Server Watermark & Permission Enforcement',
        detail: 'Enforcing server-side rasterized watermarking. Download payload locked to HTTP 403 Forbidden.',
        badge: 'Server Guardrail',
        icon: Droplets,
      },
      {
        type: 'output',
        title: 'Dataroom Vault Live',
        detail: 'https://app.coneshare.com/s/dr_apex_acq (Password protected + Download disabled)',
        badge: 'Dataroom Ready',
        icon: CheckCircle2,
      },
      {
        type: 'telemetry',
        title: 'Access Audit Stream',
        detail: 'Audit log logged to database: 3 buyer accounts verified, 0 unwatermarked leaks possible.',
        badge: 'Audit Trail Exported',
        icon: Activity,
      },
    ],
  },
  {
    id: 'lp_update',
    title: 'LP Report & Engagement Analysis',
    badge: 'Investor Relations',
    prompt:
      '"Pull view engagement for Q4 LP Report and rank investors by dwell time on the Track Record breakdown."',
    steps: [
      {
        type: 'agent',
        title: 'Agent Tool Invocation',
        detail: 'Calling list_view_sessions() and get_view_session() to inspect session timelines.',
        code: 'list_view_sessions(document_id="doc_01J9...") -> get_view_session(session_id="vs_01J9...")',
        icon: Terminal,
      },
      {
        type: 'guard',
        title: 'Privacy-Preserving Analytics Resolution',
        detail: 'Token-efficient aggregation filters raw heartbeat events without leaking recipient credentials.',
        badge: 'Token Optimized',
        icon: Shield,
      },
      {
        type: 'output',
        title: 'Dwell Time Breakdown Ranked',
        detail: 'Institutional LP #1: 4m 12s on Slide 7 (Fund III Net IRR). Sovereign Wealth LP #2: 3m 05s.',
        badge: 'Insight Delivered',
        icon: CheckCircle2,
      },
      {
        type: 'telemetry',
        title: 'Action Trigger Dispatched',
        detail: 'Agent autonomously drafts prioritized follow-up notes for the General Partner.',
        badge: 'Workflow Complete',
        icon: Sparkles,
      },
    ],
  },
];

export function AgentSimulator() {
  const [activeScenarioId, setActiveScenarioId] = useState(SIMULATION_SCENARIOS[0].id);

  const scenario = SIMULATION_SCENARIOS.find((s) => s.id === activeScenarioId) || SIMULATION_SCENARIOS[0];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
      {/* Header / Selector Tabs */}
      <div className="border-b border-gray-200 bg-gray-50/80 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 font-mono">
              Live Agent Execution Simulator
            </span>
          </div>
          <span className="text-xs text-gray-500 font-mono">Select a workflow prompt to test:</span>
        </div>

        {/* Prompt Scenario Pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {SIMULATION_SCENARIOS.map((sc) => {
            const isSelected = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                onClick={() => setActiveScenarioId(sc.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-900 ring-offset-1'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <span>{sc.title}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isSelected ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {sc.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Simulator Body */}
      <div className="p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Natural Language Prompt */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono">
              1. Prompt Given to AI Agent
            </span>
            <div className="mt-2 rounded-xl bg-gray-900 p-4 text-xs font-mono text-emerald-400 border border-gray-800 shadow-inner leading-relaxed">
              <span className="text-gray-500 select-none">AI Context &gt; </span>
              {scenario.prompt}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-950 flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900">Sovereignty Guarantee</p>
              <p className="text-emerald-800 mt-0.5 leading-normal">
                Files are streamed directly from your private storage without uploading to third-party AI databases.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Trace Timeline */}
        <div className="lg:col-span-8 flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 font-mono mb-3">
            2. Autonomous Execution Trace
          </span>

          <div className="space-y-3 font-mono text-xs">
            {scenario.steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-xl border border-gray-200 bg-gray-50/60 p-3.5 sm:p-4 hover:bg-white hover:border-gray-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-white border border-gray-200 shadow-sm text-gray-800 shrink-0">
                      <Icon className="w-4 h-4 text-gray-700" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{step.title}</span>
                        {step.badge && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 font-medium">
                            {step.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 mt-1 font-sans text-xs">{step.detail}</p>
                      {step.code && (
                        <p className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200/60 break-all font-mono">
                          {step.code}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold self-end sm:self-center shrink-0">
                    STEP 0{idx + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
