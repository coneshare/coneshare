import Link from 'next/link';
import Image from 'next/image';
import { Shield, Eye, Zap, Palette, Folder, MessageSquare, CheckCircle, ArrowRight } from 'lucide-react';
import { DataroomMockupCarousel } from '../../components/DataroomMockupCarousel';

export const metadata = {
  title: 'Secure Self-Hosted Virtual Dataroom (VDR) | Coneshare',
  description:
    'Build a secure virtual dataroom on top of your existing Nextcloud, Google Drive, Dropbox, or local storage. Control access, track viewer engagement, and automate workflows.',
  keywords: [
    'virtual dataroom',
    'self hosted vdr',
    'open source vdr',
    'secure document sharing',
    'docsend alternative',
    'dataroom tracking',
  ],
  alternates: {
    canonical: '/virtual-dataroom',
  },
};

export default function VirtualDataroomPage() {
  const steps = [
    {
      number: '01',
      title: 'Connect & Organize Custom Folders',
      description:
        'Connect your trusted storage provider in seconds. Import files into Coneshare and organize them into custom datarooms. When files are updated in your cloud storage, sync them instantly to Coneshare with a single click.',
      image: '/screenshots/feat-vdr-add-content.png',
    },
    {
      number: '02',
      title: 'Enforce Secure Sharing & Watermarking',
      description:
        'Set custom passwords, expiration limits, email verification checkpoints, and download restrictions. Enable dynamic watermarks that automatically embed the recipient\'s verified email address onto previews and downloads.',
      image: '/screenshots/feat-sharing.png',
    },
    {
      number: '03',
      title: 'Analyze Page-by-Page Engagement',
      description:
        'Stop guessing if your pitch deck or deal files were read. Monitor views, revisits, downloads, page-level viewing times, and video playback segments (including muted/unmuted states and playback speeds) in real time.',
      image: '/screenshots/feat-analytics.png',
    },
    {
      number: '04',
      title: 'Trigger Real-time Downstream Workflows',
      description:
        'Link document activity to action workflows. Instantly send Slack notifications or route JSON webhook payloads to your internal CRM when an investor enters a dataroom or a client downloads a contract.',
      image: '/screenshots/feat-automations.png',
    },
  ];

  const corePillars = [
    {
      name: 'Custom Brand Identity',
      description: 'Personalize datarooms with unique company banners, logos, and custom primary/secondary color schemes.',
      icon: Palette,
    },
    {
      name: 'Diligence Q&A Threads',
      description: 'Facilitate secure discussions between dataroom owners and external viewers directly on shared documents.',
      icon: MessageSquare,
    },
    {
      name: 'Virtual Folder Trees',
      description: 'Reorder sibling items manually and build custom hierarchies scoped exclusively to specific share links.',
      icon: Folder,
    },
  ];

  const faqs = [
    {
      q: 'How does Coneshare secure files compared to public SaaS datarooms?',
      a: 'Public SaaS platforms copy and store your sensitive corporate files on third-party servers outside your security perimeter. Coneshare connects directly to your storage (Nextcloud, Google Drive, Dropbox, local storage) to import files into your own self-hosted infrastructure. Previews and watermarked downloads are generated locally, ensuring your files never leave your infrastructure boundary.',
    },
    {
      q: 'Does it support dynamic PDF watermarking?',
      a: 'Yes. If watermarking is enabled for a share link or a specific document, Coneshare renders PDF pages with a dynamic watermark overlay displaying the viewer\'s verified email address, preventing leaks and unauthorized distribution.',
    },
    {
      q: 'How does the VDR Q&A collaboration work?',
      a: 'Coneshare allows VDR owners to enable a secure Q&A tab on shared links. Viewers can submit questions directly on files, and owners can review, assign, and answer them within Coneshare\'s dashboard, eliminating scattered email threads.',
    },
    {
      q: 'Is it easy to self-host Coneshare?',
      a: 'Absolutely. Coneshare is designed with self-hosting in mind. You can deploy it on your own server or private cloud using Docker Compose in just a few minutes, giving you full ownership over your database logs, metadata, and visitor analytics.',
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
          <span className="inline-flex items-center gap-x-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
            <CheckCircle className="h-3 w-3 text-gray-900" />
            100% Self-Hosted &amp; Open Source VDR
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Secure, Self-Hosted Virtual Dataroom (VDR)
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
            Overlay controlled sharing, viewer analytics, and follow-up workflows on top of your existing cloud or on-premise storage. Keep your data under your complete sovereignty.
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
              A Virtual Dataroom (VDR) is a secure, controlled digital vault designed for distributing highly sensitive files (e.g. corporate financials, board materials, intellectual property, M&amp;A due diligence) to external counterparts. 
            </p>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Unlike standard storage links, a VDR adds advanced access controls, page-level tracking metrics, dynamic watermarking, and workflow automations, ensuring that you retain complete oversight after a document is shared.
            </p>
          </div>

          {/* Right Column: Why choose Coneshare */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Why Choose Coneshare?
            </h2>
            <ul className="mt-6 space-y-5">
              <li className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900">Data Sovereignty First</h4>
                  <p className="text-sm text-gray-600 mt-1">Files are hosted on your own self-hosted infrastructure. Coneshare never locks you into a proprietary cloud vault.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900">Free Open-Source Core</h4>
                  <p className="text-sm text-gray-600 mt-1">Our open-source version is completely free with no user limits. Scale to Enterprise (charged per user) only when you need advanced governance like SSO, LDAP, departments, or file search.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-gray-950 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-gray-900">One-click cloud syncing</h4>
                  <p className="text-sm text-gray-600 mt-1">Connect Nextcloud or Google Drive to import files. Sync updates instantly with a single click whenever cloud files change.</p>
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
              Built for high-stakes external collaboration
            </h2>
            <p className="mt-4 text-base text-gray-600">
              In addition to basic links, Coneshare provides professional virtual dataroom capabilities for teams.
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
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 text-center">Coneshare vs SaaS Alternatives</h2>
        <p className="text-base text-gray-600 text-center mt-4 max-w-2xl mx-auto">
          Compare the security of self-hosted, storage-agnostic infrastructure against public cloud-hosted VDR providers.
        </p>

        <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-900">Feature</th>
                <th className="px-6 py-4 font-semibold text-gray-900">Coneshare (Self-Hosted)</th>
                <th className="px-6 py-4 font-semibold text-gray-900">DocSend / Public SaaS VDR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-gray-700">
              <tr>
                <td className="px-6 py-4 font-medium">Data Sovereignty</td>
                <td className="px-6 py-4">Total control (Files remain on your infrastructure)</td>
                <td className="px-6 py-4">No (Files are copied to third-party databases)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Storage Integration</td>
                <td className="px-6 py-4">Public cloud (Dropbox, Google Drive) &amp; private/self-hosted storage (Nextcloud, Internal Storage)</td>
                <td className="px-6 py-4">Public cloud only (Google Drive, Dropbox). No support for private/self-hosted storage (Nextcloud)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Granular VDR Access</td>
                <td className="px-6 py-4">Yes (Per-item visibility &amp; download limits)</td>
                <td className="px-6 py-4">Yes</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Behavioral Telemetry</td>
                <td className="px-6 py-4">Yes (Page tracking, video HLS play logs)</td>
                <td className="px-6 py-4">Yes</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Auditability</td>
                <td className="px-6 py-4">All audit logs are stored in your own infrastructure and can be consumed directly by internal systems (e.g. SIEM)</td>
                <td className="px-6 py-4">Limited to SaaS dashboard views and CSV exports; logs cannot be directly ingested into internal systems</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium">Pricing Model</td>
                <td className="px-6 py-4 font-semibold text-green-700">Free Open Source Core (no user limit); Paid Enterprise plan (charged by users) for advanced features (SSO/LDAP)</td>
                <td className="px-6 py-4">Per-user seats + scaling costs from Day 1 (highly expensive)</td>
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
