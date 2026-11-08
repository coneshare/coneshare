import Link from 'next/link';

export const metadata = {
  title: 'About ConeShare | Keep Files on Your Infrastructure, Keep Control in Your Hands',
  description:
    'Why we built ConeShare and how it turns your existing storage into a secure, self-hosted virtual dataroom with granular controls and page-level telemetry.',
  alternates: {
    canonical: '/about',
  },
};

const principles = [
  {
    title: 'Zero-Migration Direct Storage Mount',
    body:
      'Organizations already manage assets in Nextcloud, local NFS, or cloud buckets. ConeShare mounts your existing storage in place, adding access governance and analytics without duplicating or migrating files.',
  },
  {
    title: '100% Open-Source Code Transparency',
    body:
      'Security cannot rely on black-box claims. ConeShare core code is entirely open source, enabling your security engineers to audit data flows and deploy with full confidence behind your enterprise firewall.',
  },
  {
    title: 'API-First & Ecosystem Extensibility',
    body:
      'Every link configuration, audit log, and engagement event is accessible via standard APIs and webhooks, seamlessly connecting with Slack, Microsoft Teams, CRM workflows, and AI agents.',
  },
];

const trustCommitments = [
  {
    title: '100% Auditable Open Source',
    body: 'Complete frontend and backend source code is open to public review, with zero backdoors, proprietary telemetry trackers, or hidden phone-home calls.',
  },
  {
    title: 'Air-Gapped & Offline Ready',
    body: 'Supports on-premise deployment in fully air-gapped, physically disconnected VPC environments with offline enterprise licensing.',
  },
  {
    title: 'Files Never Leave Your Perimeter',
    body: 'Sensitive documents remain in your self-hosted storage. Document rendering, sandboxing, and dynamic watermarks are computed locally.',
  },
  {
    title: 'Dedicated Enterprise Support',
    body: 'Direct engineering architecture guidance, custom SSO/SCIM integrations, high-availability deployments, and SLA-backed support.',
  },
];

const signupUrl = 'https://app.coneshare.com/signup';

export default function AboutPage() {
  return (
    <div className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">About ConeShare</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Keep files on your own servers. Keep security and insights in your own hands.
          </h1>
        </div>

        <section className="mx-auto mt-16 max-w-4xl sm:mt-20">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">The Problem We Solve</h2>
            <p>
              Fundraising rounds, M&amp;A due diligence, legal audits, and enterprise sales all depend on sharing confidential files with external counterparties. Once a link is sent, dealmakers are left in the dark: Did the partner open the proposal? How many minutes did they spend on the valuation slide? Was the confidential deck secretly forwarded to a competitor?
            </p>
            <p>
              Traditional cloud drives are built for internal team sync, losing all visibility and governance once files cross organizational boundaries. <strong>ConeShare was created to bridge this exact gap</strong>: without forcing you to migrate existing files, it overlays password gates, click-through NDAs, dynamic anti-leak watermarking, and page-by-page viewing telemetry directly over your existing infrastructure.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Principles</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">How We Build</h2>
            </div>
            <div className="space-y-8 lg:col-span-8">
              {principles.map((principle, index) => (
                <div key={principle.title} className="grid gap-4 sm:grid-cols-12">
                  <p className="text-sm font-semibold text-gray-400 sm:col-span-2">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <div className="sm:col-span-10">
                    <h3 className="text-base font-semibold text-gray-900">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{principle.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Looking Ahead</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">Engineering &amp; Product Philosophy in the AI Era</h2>
            </div>
            <div className="space-y-6 lg:col-span-8">
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-bold">1</span>
                  <h3 className="text-base font-semibold text-gray-900">Building faster with AI, passing the savings to users</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  We leverage modern AI coding tools and rigorous automated test suites throughout our daily development. This allows a lean, elite engineering team to deliver reliable enterprise features at rapid velocity without the bloated operational overhead of traditional SaaS giants. Those structural cost efficiencies flow directly into our pricing: our core platform is open source and free forever, while enterprise self-hosted licensing costs a fraction of legacy VDR vendors.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-bold">2</span>
                  <h3 className="text-base font-semibold text-gray-900">Integrating AI agents while preserving strict data privacy</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  A virtual dataroom shouldn’t just be a passive file repository. ConeShare connects natively to external AI agent ecosystems via the open Model Context Protocol (MCP), and integrates on-demand document Q&amp;A, diligence review assistants, automatic summaries, and redaction. Every AI capability can be hooked into local or private LLMs, guaranteeing that sensitive business intelligence never leaves your enterprise boundary.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why Enterprises Trust ConeShare: Security Commitments */}
        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Security &amp; Trust</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">Why Enterprises Trust ConeShare with Critical Assets</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-8">
              {trustCommitments.map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-200 p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-4xl rounded-lg bg-gray-900 px-6 py-8 text-white sm:px-8">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <h2 className="text-2xl font-bold tracking-tight">Try the Live Demo</h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Experience the interactive document viewer, dynamic access gates, and telemetry dashboard in our public sandbox before deploying ConeShare on your own servers.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
              <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Live Demo
              </Link>
              <Link href={signupUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Get Started
              </Link>
              <Link href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                GitHub Repository
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl text-sm leading-6 text-gray-600">
          <p>
            For enterprise procurement, security questionnaires, or architecture guidance, contact{' '}
            <a href="mailto:sales@coneshare.com" className="font-semibold text-gray-900 hover:text-gray-700">
              sales@coneshare.com
            </a>
            . For technical support and responsible security disclosures, contact{' '}
            <a href="mailto:dev@coneshare.com" className="font-semibold text-gray-900 hover:text-gray-700">
              dev@coneshare.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
