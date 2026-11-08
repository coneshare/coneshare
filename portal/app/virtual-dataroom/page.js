import Link from 'next/link';
import Image from 'next/image';
import { Shield, Eye, Zap, Palette, Folder, MessageSquare, CheckCircle, ArrowRight, Link2 } from 'lucide-react';
import { DataroomMockupCarousel } from '../../components/DataroomMockupCarousel';

export const metadata = {
  title: 'Secure Self-Hosted Virtual Dataroom (VDR) | ConeShare',
  description:
    'Turn your existing Nextcloud, Google Drive, Dropbox, or local storage into a secure virtual dataroom. Granular folder permissions, dynamic watermarking, diligence Q&A, and page-by-page analytics.',
  keywords: [
    'virtual dataroom',
    'self hosted vdr',
    'open source vdr',
    'secure document sharing',
    'docsend alternative',
    'dataroom tracking',
    'deal room',
    'due diligence dataroom',
  ],
  alternates: {
    canonical: '/virtual-dataroom',
  },
};

export default function VirtualDataroomPage() {
  const steps = [
    {
      number: '01',
      title: 'Direct Storage Mount & Folder Curation',
      description:
        'Mount your existing storage (Nextcloud, local NFS, S3-compatible, Google Drive, Dropbox) directly without migrating files. Build custom multi-tier folder hierarchies and keep content continuously in sync with one click.',
      image: '/screenshots/feat-vdr-add-content.png',
    },
    {
      number: '02',
      title: 'Multi-Barrier Access Gates & Dynamic Watermarking',
      description:
        'Protect sensitive files with passwords, email OTP verification, domain whitelists, and click-through NDAs before granting viewing access. Full-screen dynamic watermarks burn recipient emails, IPs, and timestamps across document previews.',
      image: '/screenshots/feat-sharing.png',
    },
    {
      number: '03',
      title: 'Page-Level Analytics & Buyer Engagement',
      description:
        'Gain complete visibility into deal dynamics. Track exact seconds spent per slide, completion rates, video playback segments, and auto-detect when links are forwarded internally to new stakeholders.',
      image: '/screenshots/feat-analytics.png',
    },
    {
      number: '04',
      title: 'Instant Deal Alerts & CRM Sync',
      description:
        'Trigger instant notifications via Slack, Microsoft Teams, email, or outbound Webhooks whenever a prospective investor accesses the dataroom, re-reads pricing pages, or downloads contracts.',
      image: '/screenshots/feat-automations.png',
    },
  ];

  const corePillars = [
    {
      name: 'Granular Multi-Buyer Scoping',
      description: 'Generate multiple isolated links for a single room. Customize folder visibility, download permissions, and passwords independently per buyer.',
      icon: Link2,
    },
    {
      name: 'Confidential Diligence Q&A',
      description: 'Encrypted document-adjacent Q&A threads where bidders submit diligence queries isolated from competing parties, preserving full audit integrity.',
      icon: MessageSquare,
    },
    {
      name: 'White-Label Deal Room Branding',
      description: 'Custom banners, logos, and firm color schemes to present a polished, institutional diligence portal to counterparties.',
      icon: Palette,
    },
  ];

  const faqs = [
    {
      q: 'How does ConeShare protect sensitive files compared to public SaaS datarooms?',
      a: 'Conventional SaaS VDRs copy and host your confidential deal files on third-party multi-tenant servers. ConeShare operates on a self-hosted architecture that connects directly to your existing storage (Nextcloud, local filesystems, S3, Google Drive, Dropbox). High-definition previews, watermarking, and visitor analytics execute within your private infrastructure perimeter, ensuring files never leak to external vendors.',
    },
    {
      q: 'Does it support dynamic PDF, Office, and video watermarking?',
      a: 'Yes. ConeShare dynamically overlays full-screen watermarks with recipient email addresses, access IPs, and timestamps across PDFs, Office documents, multi-sheet spreadsheets, and video previews, creating strong attribution and deterring screen capture or camera photos.',
    },
    {
      q: 'How does the buyer-isolated Diligence Q&A work?',
      a: 'ConeShare lets deal administrators enable a dedicated Q&A module on any dataroom link. Counterparties can post questions directly against specific files or folders. Each buyer cohort communicates in full isolation—competing bidders cannot see each other\'s queries, while your deal team manages responses from a centralized dashboard.',
    },
    {
      q: 'Can I self-host ConeShare in air-gapped or restricted networks?',
      a: 'Yes. ConeShare ships with Docker Compose recipes engineered for rapid on-premise or VPC deployments. It can operate in private subnets, hybrid clouds, or fully air-gapped internal environments without external phone-home dependencies.',
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="bg-white">
      {/* Hero Section */}
      <div className="relative isolate px-6 pt-16 lg:px-8">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0)',
            backgroundSize: '24px 24px',
            maskImage: 'linear-gradient(to bottom, white, transparent)',
          }}
          aria-hidden="true"
        />
        <div className="mx-auto max-w-4xl py-20 sm:py-28 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Sovereign Virtual Dataroom (VDR) on Your Own Storage
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
            Mount your Nextcloud, local NFS, or cloud storage into an institutional-grade virtual dataroom. Enforce multi-buyer link isolation, confidential diligence Q&amp;A, and page-by-page engagement telemetry without moving a single file.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/demo"
              className="rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              View Live Demo
            </Link>
            <a
              href="https://github.com/coneshare/coneshare"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700 flex items-center gap-1"
            >
              Explore GitHub <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        {/* Floating Mockup Browser Window Carousel */}
        <div className="mx-auto max-w-5xl px-6 lg:px-8 pb-16">
          <DataroomMockupCarousel />
        </div>
      </div>

      {/* Trust & Integrations Bar */}
      <div className="bg-gray-50 border-y border-gray-100 py-10">
        <div className="mx-auto max-w-5xl px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">
            Works seamlessly on top of your existing storage
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 font-semibold text-gray-700">
            <span className="flex items-center gap-2">Nextcloud</span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-2">Google Drive</span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-2">Dropbox</span>
          </div>
        </div>
      </div>

      {/* What is VDR & Why Coneshare Section */}
      <div className="mx-auto max-w-5xl px-6 lg:px-8 py-20 border-b border-gray-150">
        <div className="grid gap-16 lg:grid-cols-2">
          {/* Left Column: What is a VDR */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              What is a Virtual Dataroom (VDR)?
            </h2>
            <p className="mt-6 text-base leading-7 text-gray-600">
              A Virtual Dataroom (VDR) is an institutional-grade, highly controlled document repository engineered for distributing high-stakes corporate files—including fundraising pitch decks, financial audits, IP assets, and M&amp;A due diligence.
            </p>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Unlike generic public cloud links, a true VDR provides multi-tier access gates, dynamic anti-leak watermarking, page-by-page engagement telemetry, and buyer-isolated Q&amp;A threads—giving dealmakers complete oversight after files leave their perimeter.
            </p>
          </div>

          {/* Right Column: Why choose Coneshare */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Why Choose ConeShare?
            </h2>
            <ul className="mt-6 space-y-5">
              <li className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900">Zero-Migration Storage Mounting</h4>
                  <p className="text-sm text-gray-600 mt-1">Directly mount Nextcloud, local NFS, S3, or existing cloud buckets. When files update at the source, your datarooms sync immediately without broken links.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900">100% Data Sovereignty</h4>
                  <p className="text-sm text-gray-600 mt-1">Host on your own VPC or bare metal. Keep corporate files and audit logs strictly within your enterprise compliance boundary.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900">Fair Open-Source Model</h4>
                  <p className="text-sm text-gray-600 mt-1">Core VDR capabilities are fully open-source with no seat limits. Pay only when you scale into enterprise governance (SSO, SCIM, team workspaces).</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step-by-Step Value Flow */}
      <div className="py-20 sm:py-28 space-y-24 sm:space-y-36">
        <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Controlled document delivery in 4 simple steps
          </h2>
          <p className="mt-4 text-base text-gray-600">
            Coneshare integrates into your workflow, adding a secure sharing and monitoring layer that syncs on-demand.
          </p>
        </div>

        {steps.map((step, idx) => (
          <div key={step.number} className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className={`grid gap-12 lg:grid-cols-12 lg:items-center ${idx % 2 === 1 ? 'lg:flex-row-reverse' : ''}`}>
              <div className={`lg:col-span-5 ${idx % 2 === 1 ? 'lg:order-last' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-gray-400">{step.number}</span>
                  <h3 className="text-2xl font-bold tracking-tight text-gray-900">{step.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-gray-600">{step.description}</p>
              </div>
              <div className="lg:col-span-7">
                <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-lg overflow-hidden">
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={1000}
                    height={625}
                    className="w-full h-auto rounded-lg border border-gray-100"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Core VDR Features Pillars */}
      <div className="bg-gray-50 border-y border-gray-100 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Built for high-stakes dealmaking and due diligence
            </h2>
            <p className="mt-4 text-base text-gray-600">
              Move beyond basic file shares with purpose-built virtual dataroom infrastructure.
            </p>
          </div>
          <div className="grid max-w-md grid-cols-1 gap-8 sm:max-w-none sm:grid-cols-3">
            {corePillars.map((pillar) => (
              <div key={pillar.name} className="flex flex-col bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white mb-6">
                  <pillar.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold leading-7 text-gray-900">{pillar.name}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 flex-grow">{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Section */}
      <div className="mx-auto max-w-5xl px-6 lg:px-8 py-16 sm:py-24">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 text-center">ConeShare vs Legacy SaaS Providers</h2>
        <p className="text-base text-gray-600 text-center mt-4 max-w-2xl mx-auto">
          Compare self-hosted, direct storage infrastructure against multi-tenant public cloud VDR platforms on privacy, scoping flexibility, and economics.
        </p>

        <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-900">Feature</th>
                <th className="px-6 py-4 font-semibold text-gray-900">ConeShare (Self-Hosted)</th>
                <th className="px-6 py-4 font-semibold text-gray-900">DocSend / Legacy SaaS VDRs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-gray-700">
              <tr>
                <td className="px-6 py-4 font-medium">Data Sovereignty</td>
                <td className="px-6 py-4">Total control (Source files and render caches reside permanently inside your private infrastructure)</td>
                <td className="px-6 py-4">No (Files are duplicated into third-party multi-tenant cloud databases)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Storage Architecture</td>
                <td className="px-6 py-4">Zero migration; direct mount for Nextcloud, local NFS, S3 buckets, Google Drive, and Dropbox</td>
                <td className="px-6 py-4">Public cloud sync only (Google Drive, Dropbox); cannot mount private or on-premise storage (Nextcloud/NFS)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Multi-Buyer Dataroom Scoping</td>
                <td className="px-6 py-4">Single room supports multiple independent links with dynamic per-buyer folder visibility and embedded Q&amp;A</td>
                <td className="px-6 py-4">Basic Spaces grouping only; requires cloning duplicate spaces to adjust folder permissions per buyer, with no native diligence Q&amp;A</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Engagement Telemetry &amp; Alerts</td>
                <td className="px-6 py-4">Page-by-page duration and video playback heatmaps; instant alerts via Slack, Microsoft Teams, and Webhooks</td>
                <td className="px-6 py-4">High-resolution slide tracking, but primarily restricted to email alerts and third-party Zapier connections</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Auditability &amp; SIEM</td>
                <td className="px-6 py-4">Complete immutable event logs stored in your SQL database; ready for direct streaming into internal SIEM / SOC tools</td>
                <td className="px-6 py-4">Constrained to vendor dashboard views or manual CSV exports; difficult to stream directly into enterprise SIEM pipelines</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Licensing &amp; Pricing Model</td>
                <td className="px-6 py-4 font-semibold text-green-700">Free open-source core with unlimited viewers and seats; upgrade to Enterprise only for SSO/SCIM governance</td>
                <td className="px-6 py-4">Steep per-user seat pricing starting from Day 1 ($65–$150+/seat/mo), escalating dramatically with team size</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Collapsible FAQ Accordion Section */}
      <div className="bg-gray-50 border-t border-gray-100 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details
                key={index}
                className="group rounded-xl border border-gray-200 bg-white p-6 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-1.5 text-gray-900 font-semibold">
                  <span className="text-base">{faq.q}</span>
                  <span className="ml-1.5 flex-shrink-0 rounded-full bg-gray-50 p-1.5 text-gray-900 group-open:rotate-180 transition-transform duration-200">
                    <ArrowRight className="h-4 w-4 rotate-90" />
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-6 text-gray-600 border-t border-gray-100 pt-4">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Box */}
      <div className="mx-auto max-w-5xl px-6 lg:px-8 py-20 sm:py-28">
        <section className="rounded-2xl bg-gray-900 px-8 py-12 text-center text-white shadow-xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Turn your storage into a virtual data room</h2>
          <p className="mt-4 text-base text-gray-200">
            Combine professional security, watermarking, and visitor tracking with complete self-hosted control.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View Live Demo
            </Link>
            <a
              href="https://github.com/coneshare/coneshare"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-white hover:text-gray-200"
            >
              Get Started on GitHub <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
