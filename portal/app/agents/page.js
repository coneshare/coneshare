import Link from 'next/link';
import { 
  ShieldCheck, 
  LineChart, 
  Bot,
  Server,
  HardDrive,
  Layers,
  FolderTree,
  Sliders,
  Users
} from 'lucide-react';
import { McpCodeCard } from '../../components/McpCodeCard';
import { AgentSimulator } from '../../components/AgentSimulator';
import { AgentsFaq } from '../../components/AgentsFaq';

export const metadata = {
  title: 'Coneshare MCP | Operate Virtual Data Rooms with Any AI Agent',
  description:
    'Coneshare supports the Model Context Protocol (MCP) natively with 27 typed tools. Let Claude, Codex, or custom AI agents operate virtual data rooms end-to-end.',
  keywords: [
    'sovereign MCP server',
    'self hosted virtual dataroom',
    'Model Context Protocol',
    'AI agent dataroom',
    'Nextcloud MCP',
    'Claude Desktop data room',
    'Codex MCP data room',
    'dynamic watermarking API',
    'private AI document sharing',
  ],
  alternates: {
    canonical: '/agents',
  },
};

export default function AgentsPage() {
  const architecturePillars = [
    {
      title: 'Zero Storage Lock-In',
      description:
        'Keep your existing folders in Nextcloud, Google Drive, or Dropbox. Coneshare acts as an on-demand distribution and watermark gateway without forcing you to migrate files.',
      icon: HardDrive,
    },
    {
      title: '100% Self-Hostable & Sovereign',
      description:
        'Run Coneshare on your own private cloud or on-premise servers. Your confidential deal files and viewer telemetry never pass through third-party AI SaaS silos.',
      icon: Server,
    },
    {
      title: 'Server-Enforced Guardrails',
      description:
        'Dynamic recipient watermarks, NDA gates, and download restrictions are applied server-side during rendering. Prompt injections cannot bypass security policies.',
      icon: ShieldCheck,
    },
  ];

  const toolCategories = [
    {
      name: 'Documents & Folders',
      count: '11 tools',
      icon: FolderTree,
      tools: [
        { name: 'list_documents', desc: 'Paginated list of workspace documents with folder filtering' },
        { name: 'get_document', desc: 'Retrieve detailed document metadata, versions, and active links' },
        { name: 'search_documents', desc: 'Search documents by full-text title or description query' },
        { name: 'update_document', desc: 'Rename or update description metadata of an existing document' },
        { name: 'delete_document', desc: 'Soft-delete a document (moves to Trash, recoverable in UI)' },
        { name: 'create_folder', desc: 'Create a new folder in workspace documents hierarchy' },
        { name: 'update_folder', desc: 'Rename an existing workspace folder' },
        { name: 'delete_folder', desc: 'Soft-delete a workspace folder' },
        { name: 'move_items', desc: 'Move documents and/or subfolders into destination folders' },
        { name: 'request_document_upload', desc: 'Get pre-signed URL for direct chunked storage uploads' },
        { name: 'finalize_document_upload', desc: 'Commit document metadata & trigger background preview render' },
      ],
    },
    {
      name: 'Virtual Datarooms',
      count: '7 tools',
      icon: Layers,
      tools: [
        { name: 'list_datarooms', desc: 'List organization datarooms with pagination metadata' },
        { name: 'get_dataroom', desc: 'Retrieve dataroom item hierarchy, permissions, and settings' },
        { name: 'create_dataroom', desc: 'Create a new dataroom to group and share multiple documents' },
        { name: 'add_content_to_dataroom', desc: 'Attach workspace documents to an existing dataroom' },
        { name: 'remove_content_from_dataroom', desc: 'Remove workspace documents from an existing dataroom' },
        { name: 'update_dataroom', desc: 'Update metadata (name, description) for an existing dataroom' },
        { name: 'delete_dataroom', desc: 'Soft-delete a dataroom' },
      ],
    },
    {
      name: 'Share Links & Controls',
      count: '3 tools',
      icon: Sliders,
      tools: [
        { name: 'list_share_links', desc: 'List active share links filterable by document or dataroom' },
        { name: 'create_share_link', desc: 'Mint link with NDA gate, dynamic watermark, OTP email verify & expiry' },
        { name: 'update_share_link', desc: 'Modify security parameters, custom watermark/NDA text, or toggle active state' },
      ],
    },
    {
      name: 'Engagement Analytics',
      count: '3 tools',
      icon: LineChart,
      tools: [
        { name: 'get_document_analytics', desc: 'Overall page view durations, total viewers, and engagement statistics' },
        { name: 'list_view_sessions', desc: 'List viewer sessions with summary metadata (email, location, dwell time)' },
        { name: 'get_view_session', desc: 'Detailed session breakdown: page-by-page dwell, video heartbeats, clicks' },
      ],
    },
    {
      name: 'Admin & Governance',
      count: '3 tools',
      icon: Users,
      tools: [
        { name: 'list_admin_users', desc: 'List all organization users with search and pagination' },
        { name: 'get_admin_user_details', desc: 'Detailed user profile, created links count, and view engagement' },
        { name: 'list_login_activities', desc: 'Organization user login activity logs (IP, user agent, timestamps)' },
      ],
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative isolate px-6 pt-12 lg:px-8 pb-20 sm:pb-28 border-b border-gray-200">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #d1d5db 1px, transparent 0)',
            backgroundSize: '24px 24px',
            maskImage: 'linear-gradient(to bottom, white 60%, transparent)',
          }}
          aria-hidden="true"
        />

        <div className="mx-auto max-w-5xl text-center pt-8 sm:pt-14">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/90 px-3.5 py-1 text-xs font-semibold text-gray-800 shadow-sm mb-6">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Coneshare MCP · 27 Typed Tools for Virtual Data Rooms</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-6xl max-w-3xl mx-auto leading-tight">
            Let Any AI Agent Operate Your Data Rooms via MCP.
          </h1>

          <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
            Coneshare supports the Model Context Protocol (MCP) natively with 27 typed tools. Connect Claude, Codex, Antigravity CLI, or custom agents to spin up data rooms, upload files, mint watermarked links, and track page-level viewing analytics.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="https://app.coneshare.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 transition-colors"
            >
              Get an API Token
            </Link>
            <Link
              href="/demo"
              className="rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Explore Live Demo <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="https://docs.coneshare.com/en/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 px-3 py-3"
            >
              Documentation
            </Link>
          </div>

          {/* Interactive Agent Simulator Widget */}
          <div className="mt-14 text-left">
            <AgentSimulator />
          </div>
        </div>
      </div>

      {/* Architecture Section: The Bridge */}
      <div className="py-20 sm:py-28 mx-auto max-w-5xl px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">Architecture</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            The Bridge Between AI Agents and Coneshare Server
          </h2>
          <p className="mt-4 text-base text-gray-600">
            Coneshare MCP acts as a secure bridge between your desktop/CLI agents and the Coneshare server, wrapping versioned REST APIs into 27 typed tools that agents can execute over SSE streams.
          </p>
        </div>

        {/* Visual Architecture Flow Diagram */}
        <div className="mt-12 rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Step 1: AI Clients */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm text-center">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-800 mx-auto mb-3">
                <Bot className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm">AI Agent Client</h4>
              <p className="text-xs text-gray-500 mt-1 font-mono">Claude Desktop · Claude Code · agy · Cursor · VS Code · Codex</p>
              <p className="text-xs text-gray-600 mt-2">Invokes MCP tools via HTTPS/SSE with Bearer API token</p>
            </div>

            {/* Step 2: Coneshare MCP Layer */}
            <div className="rounded-xl border-2 border-gray-900 bg-gray-900 text-white p-5 shadow-md text-center relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-gray-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono">
                MCP Gateway (/mcp/sse)
              </span>
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-emerald-400 mx-auto mb-3">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-sm">Coneshare MCP Server</h4>
              <p className="text-xs text-gray-400 mt-1 font-mono">FastMCP · 27 Typed Tools</p>
              <p className="text-xs text-gray-300 mt-2">Validates params, scopes auth, and proxies calls to REST API</p>
            </div>

            {/* Step 3: Coneshare Backend & Storage */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm text-center">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-800 mx-auto mb-3">
                <HardDrive className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-gray-900 text-sm">Coneshare Server &amp; Storage</h4>
              <p className="text-xs text-gray-500 mt-1 font-mono">Django REST + Nextcloud / Drive</p>
              <p className="text-xs text-gray-600 mt-2">Enforces permissions, renders watermarks &amp; logs audit telemetry</p>
            </div>
          </div>
        </div>

        {/* Pillars Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {architecturePillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="rounded-xl border border-gray-200 p-6 bg-white shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-900 mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{p.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Complete 27 Tools Catalog */}
      <div className="bg-gray-50 py-20 sm:py-28 border-y border-gray-200">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">Complete Tool Suite</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              27 typed MCP tools for total operational control
            </h2>
            <p className="mt-4 text-base text-gray-600">
              Everything your agent needs to manage documents, organize datarooms, mint secure links, and query telemetry.
            </p>
          </div>

          <div className="mt-12 space-y-8">
            {toolCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.name} className="rounded-xl border border-gray-200 bg-white p-6 sm:p-7 shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-gray-100 text-gray-800">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{cat.name}</h3>
                    </div>
                    <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                      {cat.count}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                    {cat.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="p-3 rounded-lg border border-gray-200 bg-gray-50/70 hover:bg-white hover:border-gray-300 transition-all flex flex-col justify-between gap-1"
                      >
                        <span className="font-bold text-gray-900 text-emerald-800">{tool.name}()</span>
                        <span className="text-gray-600 font-sans text-xs">{tool.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Code Snippets & Quick Setup */}
      <div className="bg-white py-20 sm:py-28 border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">Developer Quickstart</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Two lines of configuration to empower your agent
            </h2>
            <p className="mt-4 text-base text-gray-600">
              Connect any MCP-compatible AI client to your Coneshare instance in seconds over remote HTTP/SSE.
            </p>
          </div>

          <div className="mt-10">
            <McpCodeCard />
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="py-20 sm:py-28 mx-auto max-w-3xl px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">FAQ</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Frequently Asked Questions
          </h2>
        </div>
        <AgentsFaq />
      </div>

      {/* Bottom CTA Banner */}
      <div className="bg-gray-900 py-16 sm:py-20 text-white">
        <div className="mx-auto max-w-5xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Deploy sovereign agent data rooms on your infrastructure
          </h2>
          <p className="mt-4 text-base text-gray-300 max-w-xl mx-auto">
            Connect your existing Nextcloud or cloud storage, generate a scoped API token, and let your AI agents run secure distributions.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="https://app.coneshare.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-gray-950 shadow-sm hover:bg-gray-100 transition-colors"
            >
              Get an API Token
            </Link>
            <Link
              href="/demo"
              className="rounded-md border border-gray-700 bg-gray-800/80 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              Explore Live Demo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
