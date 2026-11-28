import Link from 'next/link';
import Image from 'next/image';
import {
  Briefcase,
  Scale,
  ClipboardCheck,
  TrendingUp,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { DataroomWorkflowShowcase } from '../../components/DataroomWorkflowShowcase';
import { ZoomableImage } from '../../components/ZoomableImage';

export const metadata = {
  title: 'Secure Self-Hosted Virtual Dataroom (VDR) | ConeShare',
  description:
    'Turn your existing Nextcloud, Google Drive, Dropbox, or local storage into a secure virtual data room. Granular folder permissions, dynamic watermarking, private Q&A, and page-by-page analytics.',
  keywords: [
    'virtual dataroom',
    'self hosted vdr',
    'open source vdr',
    'secure document sharing',
    'docsend alternative',
    'dataroom tracking',
    'client portal',
    'secure external collaboration',
  ],
  alternates: {
    canonical: '/virtual-dataroom',
  },
};

export default function VirtualDataroomPage() {
  const useCases = [
    {
      name: 'Client & Sales Portals',
      description:
        'Bundle proposals, pricing sheets, security packets, and MSAs into one branded room and see when stakeholders review key pages.',
      icon: Briefcase,
    },
    {
      name: 'Legal & Board Governance',
      description:
        'Distribute board packets, IP filings, and confidential contracts with verified email gates, dynamic watermarks, and time-limited access.',
      icon: Scale,
    },
    {
      name: 'Audits & Vendor Reviews',
      description:
        'Share evidence libraries and compliance records with external auditors, regulators, or suppliers without copying files out of storage.',
      icon: ClipboardCheck,
    },
    {
      name: 'Fundraising & M&A',
      description:
        'Coordinate investor updates and multi-party diligence from a single directory, issuing isolated folder permissions and private Q&A per counterparty.',
      icon: TrendingUp,
    },
  ];

  const steps = [
    {
      number: '01',
      title: 'Cloud Import & Folder Curation',
      description:
        'Upload directly to your private server/S3 storage or import selected files from Nextcloud, Google Drive, and Dropbox. Build multi-tier folder hierarchies and refresh updated versions with one click without breaking shared links.',
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
      title: 'Page-Level Analytics & Stakeholder Engagement',
      description:
        'See how external stakeholders engage with your materials. Track exact seconds spent per page, completion rates, video playback segments, and internal link forwarding across teams.',
      image: '/screenshots/feat-analytics.png',
    },
    {
      number: '04',
      title: 'Instant Activity Alerts & Workflow Webhooks',
      description:
        'Trigger instant notifications via Slack, Microsoft Teams, email, or outbound Webhooks whenever an external partner enters the room, revisits key terms, or downloads a contract.',
      image: '/screenshots/feat-automations.png',
    },
  ];

  const faqs = [
    {
      q: 'How does ConeShare protect sensitive files compared to public SaaS datarooms?',
      a: 'Conventional SaaS VDRs store your confidential files on third-party multi-tenant servers. ConeShare runs on your own self-hosted infrastructure — storing files directly on your private server/S3 volume (with optional one-click file import from Nextcloud, Google Drive, or Dropbox). High-definition previews, watermarking, and visitor analytics execute within your private infrastructure perimeter.',
    },
    {
      q: 'Does it support dynamic PDF, Office, and video watermarking?',
      a: 'Yes. ConeShare dynamically overlays full-screen watermarks with recipient email addresses, access IPs, and timestamps across PDFs, Office documents, multi-sheet spreadsheets, and video previews, creating strong attribution and deterring screen capture or camera photos.',
    },
    {
      q: 'How does the link-isolated Document Q&A work?',
      a: 'ConeShare lets room administrators enable a dedicated Q&A module on any data room link. External reviewers can post questions directly against specific files or folders. Each shared link communicates in full isolation from other recipients, while your team manages replies from a centralized dashboard.',
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
      {/* Split Hero Section */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-gray-50/80 via-white to-white">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
            <div className="lg:col-span-5 text-left">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl sm:leading-[1.12]">
                Secure Virtual Data Rooms You Own
              </h1>
              <p className="mt-5 text-base leading-7 text-gray-600 sm:text-lg">
                Unlimited data rooms, unlimited viewers, and enterprise-grade security on your own servers, at a fraction of legacy VDR costs. Share client proposals, board packets, audits, or deal files with zero per-seat fees.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/demo"
                  className="rounded-md bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  View Live Demo
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 inline-flex items-center gap-1.5"
                >
                  Pricing &amp; $299 Setup <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                <ZoomableImage
                  src="/screenshots/feat-vdr-multi-link.png"
                  alt="ConeShare dataroom multi-link management and visitor session summary"
                  width={1440}
                  height={900}
                  className="w-full h-auto object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive VDR Workflow Showcase */}
      <section className="bg-gray-50/50 border-b border-gray-100 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Access scoping, private Q&amp;A, branding, and audit logs in one room
            </h2>
          </div>
          <DataroomWorkflowShowcase locale="en" />
        </div>
      </section>

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

      {/* General-Purpose Use Cases Section */}
      <section className="mx-auto max-w-5xl px-6 lg:px-8 py-16 sm:py-20 border-b border-gray-100">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            One data room for every high-trust file exchange
          </h2>
          <p className="mt-4 text-base text-gray-600">
            Whether you work in sales, legal, finance, or operations, keep every shared workspace structured, access-controlled, and traceable.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map((item) => (
            <div
              key={item.name}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">{item.name}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What is VDR & Why Coneshare Section */}
      <div className="mx-auto max-w-5xl px-6 lg:px-8 py-20 border-b border-gray-150">
        <div className="grid gap-16 lg:grid-cols-2">
          {/* Left Column: What is a VDR */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              What is a Virtual Dataroom (VDR)?
            </h2>
            <p className="mt-6 text-base leading-7 text-gray-600">
              A Virtual Dataroom (VDR) is a controlled document workspace engineered for sharing sensitive files outside your organization, from client proposals and board packets to compliance audits, vendor reviews, and fundraising.
            </p>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Unlike generic cloud links that lose oversight once forwarded, a true VDR provides per-recipient folder permissions, NDA gates, dynamic watermarks, link-isolated Q&amp;A threads, and page-by-page engagement telemetry without duplicating your internal files.
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
                  <h4 className="font-semibold text-gray-900">Seamless Cloud Import &amp; Version Sync</h4>
                  <p className="text-sm text-gray-600 mt-1">Store files directly on your private server/S3, or import selected files from Nextcloud, Google Drive, and Dropbox with one-click version refreshes that keep shared links intact.</p>
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
                  <h4 className="font-semibold text-gray-900">Free Self-Hosting or $299 Turnkey Setup</h4>
                  <p className="text-sm text-gray-600 mt-1">Core VDR capabilities are MIT open-source with unlimited seats. No DevOps team? Choose our $299 one-time Done-For-You Setup or $199/mo Managed BYOC.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step-by-Step Value Flow */}
      <div className="border-b border-gray-100 py-20 sm:py-28 space-y-24 sm:space-y-36">
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
                <td className="px-6 py-4 font-medium">Storage &amp; Cloud Import</td>
                <td className="px-6 py-4">Private local/S3 storage on your own server, plus one-click file import &amp; version sync from Nextcloud, Google Drive, and Dropbox</td>
                <td className="px-6 py-4">Public cloud upload only; no native integration with self-hosted Nextcloud or private infrastructure</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Multi-Party Access Scoping</td>
                <td className="px-6 py-4">Single room supports multiple independent links with dynamic per-recipient folder visibility and isolated Q&amp;A</td>
                <td className="px-6 py-4">Basic Spaces grouping only; requires cloning duplicate spaces to adjust folder permissions per recipient, with no native Q&amp;A</td>
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
                <td className="px-6 py-4 font-semibold text-green-700">Free MIT open-source with unlimited seats; optional $299 one-time turnkey setup or $199/mo Managed BYOC</td>
                <td className="px-6 py-4">Steep per-user seat pricing starting from Day 1 ($65–$250+/seat/mo), escalating dramatically with team size</td>
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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View Live Demo
            </Link>
            <Link href="/pricing" className="text-sm font-semibold text-white hover:text-gray-200">
              View Pricing &amp; $299 Turnkey Setup <span aria-hidden="true">→</span>
            </Link>
            <a
              href="https://github.com/coneshare/coneshare"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-gray-300 hover:text-white"
            >
              GitHub (MIT) <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
