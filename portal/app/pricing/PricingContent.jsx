'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  X,
  ChevronDown,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

const FEATURE_COMPARISON_GROUPS = [
  {
    category: 'Datarooms & Documents',
    items: [
      { name: 'Unlimited team members', community: true, pro: true },
      { name: 'Unlimited documents', community: true, pro: true },
      { name: 'Unlimited folders', community: true, pro: true },
      { name: 'Unlimited datarooms', community: true, pro: true },
      { name: 'Bulk upload', community: true, pro: true },
      { name: 'Full-text search (PDF / Office / Markdown)', community: false, pro: true },
    ],
  },
  {
    category: 'Document Analytics & Tracking',
    items: [
      { name: 'Unlimited view logs', community: true, pro: true },
      { name: 'Time spent per page', community: true, pro: true },
      { name: 'Document version tracking', community: true, pro: true },
      { name: 'Visitor geolocation tracking', community: true, pro: true },
      { name: 'Complete view history', community: true, pro: true },
      { name: 'Analytics retention', community: 'Unlimited (self-managed)', pro: 'Unlimited (self-managed)' },
      { name: 'Analytics data export', community: false, pro: true },
    ],
  },
  {
    category: 'Share Link Settings',
    items: [
      { name: 'Capture email before viewing', community: true, pro: true },
      { name: 'Email visit notifications', community: true, pro: true },
      { name: 'Password protection', community: true, pro: true },
      { name: 'Link expiration date', community: true, pro: true },
      { name: 'Allow / block document downloads', community: true, pro: true },
      { name: 'Email verification code', community: true, pro: true },
      { name: 'Allowed / blocked user lists', community: true, pro: true },
      { name: 'Dynamic watermarks', community: true, pro: true },
    ],
  },
  {
    category: 'Supported File Types',
    items: [
      { name: 'PDF files (.pdf)', community: true, pro: true },
      { name: 'Images (.png, .jpg, .jpeg, .gif, .webp, .heic, .heif)', community: true, pro: true },
      { name: 'Spreadsheets (.xls, .xlsx, .csv)', community: true, pro: true },
      { name: 'Word documents (.doc, .docx)', community: true, pro: true },
      { name: 'Videos (.mp4, .mov, .avi, .webm, .ogg, .m4v, .3gp)', community: true, pro: true },
      { name: 'Presentations (.ppt, .pptx)', community: true, pro: true },
      { name: 'Markdown files (.md)', community: true, pro: true },
    ],
  },
  {
    category: 'User & Identity Management',
    items: [
      { name: 'SSO single sign-on (with Dex)', community: true, pro: true },
      { name: 'SSO with AD/LDAP directory sync', community: false, pro: true },
      { name: 'SSO with ADFS integration', community: false, pro: true },
    ],
  },
  {
    category: 'Security & Audit',
    items: [
      { name: 'Compliance audit log', community: false, pro: true },
    ],
  },
  {
    category: 'Custom Branding',
    items: [
      { name: 'Custom organization logo', community: true, pro: true },
      { name: 'Custom brand name', community: true, pro: true },
      { name: 'Custom dataroom logo', community: true, pro: true },
      { name: 'Custom dataroom banners', community: true, pro: true },
      { name: 'Full white-labeling (remove Powered by badge, etc.)', community: false, pro: true },
    ],
  },
  {
    category: 'Support',
    items: [
      { name: 'GitHub / community forum support', community: true, pro: true },
      { name: 'Email support', community: false, pro: true },
      { name: 'Response within 1 business day', community: false, pro: true },
    ],
  },
];

function renderFeatureCell(value, planName, featureName) {
  if (typeof value === 'string') {
    return <span className="text-xs font-medium text-gray-700">{value}</span>;
  }
  if (value) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        aria-label={`${planName} supports ${featureName}`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-500"
      aria-label={`${planName} does not support ${featureName}`}
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
}

export function PricingContent() {
  const [activeFaq, setActiveFaq] = useState(null);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: 'If the Community Edition is open source under the MIT license, why choose Done-For-You Setup or Managed BYOC?',
      a: 'The Community Edition includes our full core VDR features — dynamic watermarks, click-through NDA gates, Q&A, and page-by-page analytics — with unlimited seats. If you want to skip server provisioning, SSL certificates, SMTP setup, and video transcoding tuning, you can book our $299 one-time Done-For-You Setup (delivered in 1–2 business days, then 100% yours to manage) or subscribe to Managed BYOC ($1,999/year or $199/month, 3-month minimum) for ongoing security updates, backup verification, and engineering ops support.',
    },
    {
      q: 'What is the difference between Done-For-You Setup ($299) and Managed BYOC ($1,999/year)?',
      a: 'Both deploy the full open-source edition inside your own cloud account or VPS (AWS, GCP, Azure, or private server) with unlimited internal seats and external viewers. Done-For-You Setup ($299 one-time) covers complete production installation, custom domain/SSL, SMTP, storage integration, 1x admin onboarding session, and a 14-day post-delivery warranty — with no recurring fees. Managed BYOC adds continuous ongoing operations: off-peak security upgrades, large-file/video tuning, regular database backup verification, and 1-business-day email ops support.',
    },
    {
      q: 'What happens if we stop subscribing to Managed BYOC? Do you offer refunds?',
      a: 'During the first 14 days after managed deployment, we provide a full refund if network or storage constraints prevent smooth operation. Because both the application and data live inside your own cloud account, ending a managed subscription never shuts down your instance or locks your files. Once we hand over deployment credentials to your internal IT team, your staff can take over operations at any time.',
    },
    {
      q: 'How much does raw cloud infrastructure (AWS / GCP / Azure) cost, and how should we size our server?',
      a: 'Server sizing depends primarily on the volume of shared documents and videos rather than team headcount. For teams sharing mainly PDFs, a 4 vCPU / 4GB RAM instance (~$40-$60/month on AWS or GCP) comfortably supports 50 users. If you have high volumes of HD video transcoding, we recommend 8 vCPU / 16GB RAM (~$120-$160/month). You pay your cloud provider directly with zero markups from us.',
    },
    {
      q: 'When will Pro commercial licensing and Enterprise custom plans be available?',
      a: 'Pro ($2,999/year — full white-labeling, AD/LDAP/ADFS sync, cross-document full-text search, and compliance audit logs) and Enterprise (from $9,999/year — multi-tenancy, HA clusters, air-gapped offline delivery, and custom co-development) are open for early access inquiries. Email dev@coneshare.com with your requirements and timeline to connect directly with our engineering team.',
    },
    {
      q: 'How do payments and invoicing work?',
      a: 'For smaller orders ($150/hr Support, $299 Done-For-You Setup, and quarterly Managed BYOC), we support PayPal Invoice — you can pay directly via PayPal or major credit/debit cards without needing a PayPal account. For annual contracts and larger B2B orders, we support corporate bank wire transfers (SWIFT) with a formal Commercial Invoice.',
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Simple Pricing. Zero Seat Tax.
          </h1>

          <p className="mt-4 text-base leading-7 text-gray-600 max-w-2xl mx-auto">
            Every plan includes <strong>unlimited team members and external visitors</strong>, with files and instances staying 100% on your own servers or cloud account. Self-host free with Docker, book a $299 turnkey setup, or let our engineers manage your private cloud (Managed BYOC).
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
          {/* Tier 1: Community */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Community</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                For technical teams with ops capability who want open-source, self-managed control.
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-4xl font-bold tracking-tight text-gray-900">$0</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ free forever</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">MIT Open Source License • Self-hosted via Docker</p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">Full core features included:</p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Complete VDR: virtual datarooms, dynamic watermarks, NDA gates, Q&A, and page-by-page analytics</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Unlimited team seats, datarooms, and share links</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Connect local storage, Nextcloud, Google Drive, or Dropbox</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Native remote MCP server for Claude, Cursor, and ChatGPT</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Community forum and GitHub support</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="https://github.com/coneshare/coneshare-compose"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
              >
                Deploy Free with Docker
                <ExternalLink className="ml-1.5 h-3.5 w-3.5 text-gray-400" />
              </a>
              <div className="mt-2.5 text-center">
                <a
                  href="https://github.com/coneshare/coneshare"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"
                >
                  View source on GitHub &rarr;
                </a>
              </div>
            </div>
          </div>

          {/* Tier 2: Done-For-You Setup */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-gray-900 bg-white p-8 shadow-md">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold tracking-tight text-gray-900">Done-For-You Setup</h3>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Fastest Launch
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                One-time white-glove production deployment on your own cloud or VPS in 1–2 business days. No recurring lock-in.
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-4xl font-bold tracking-tight text-gray-900">$299</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ one-time</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Unlimited seats &amp; viewers • 100% yours after handoff
              </p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  End-to-end delivery by our engineers:
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Production deployment on your AWS, GCP, Azure, or private VPS</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Custom domain, automated HTTPS/SSL, and transactional SMTP setup</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Storage setup (Nextcloud, Google Drive, Dropbox, or local) plus watermark &amp; preview tuning</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>1x remote admin onboarding session + 14-day post-delivery troubleshooting warranty</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Zero vendor lock-in: data and instances stay 100% on your server</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Done-For-You%20Setup%20(%24299)"
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
              >
                Book Turnkey Setup ($299)
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                1–2 business days • PayPal, Credit Card, or Wire Transfer
              </p>
            </div>
          </div>

          {/* Tier 3: Managed BYOC */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Managed BYOC</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                Official managed private cloud: deployed inside your own cloud account, continuously upgraded and backed up by our team.
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-4xl font-bold tracking-tight text-gray-900">$1,999</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ year</span>
                <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  ~$167/mo
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Or <strong className="text-gray-700">$199 / month</strong> (3-mo min $597) • 14-day refund guarantee
              </p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  Includes everything in Done-For-You Setup, plus:
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Large-file transcoding, video streaming, and centralized log tuning</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Off-peak security updates and regular database backup verification</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Managed ops support: 1-business-day email response from core engineers</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Zero vendor lock-in: your instance keeps running even if you cancel</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Managed%20BYOC%20Inquiry"
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
              >
                Request Managed Deployment
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                Unlimited seats • PayPal, Credit Card, or Wire + Invoice
              </p>
            </div>
          </div>
        </div>

        {/* Pro & Enterprise Early Access Banner */}
        <div className="mx-auto mt-10 max-w-7xl rounded-2xl border border-gray-200 bg-gray-50/70 p-8 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-xl font-bold tracking-tight text-gray-900">
                  Pro Licensing &amp; Enterprise Custom Plans
                </h3>
                <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                  Early Access / Contact Sales
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-gray-600 max-w-3xl">
                Built for larger organizations with strict compliance or bespoke workflows: <strong>Pro ($2,999 / year)</strong> adds full white-labeling (remove Powered by badge), AD/LDAP/ADFS sync, cross-document full-text search, and compliance audit log export. <strong>Enterprise (from $9,999 / year)</strong> adds multi-tenancy (Multi-Org), HA clusters or air-gapped offline delivery, a dedicated 24-hour Slack SLA, and custom co-development.
              </p>
            </div>

            <div className="lg:w-72 lg:flex-shrink-0">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Pro%20%2F%20Enterprise%20Inquiry"
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
              >
                Contact Engineering Team
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                Corporate agreements &amp; compliance reviews supported
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white pt-12 pb-20 sm:pt-16 sm:pb-24 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Compare Features
            </h2>
          </div>

          <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold text-gray-900">
                    Feature
                  </th>
                  <th scope="col" className="w-44 px-6 py-4 text-center font-semibold text-gray-900">
                    Community
                    <span className="block text-xs font-normal text-gray-500">Open-Source Self-Hosted</span>
                  </th>
                  <th scope="col" className="w-44 px-6 py-4 text-center font-semibold text-gray-900">
                    Pro
                    <span className="block text-xs font-normal text-gray-500">Commercial Self-Hosted</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {FEATURE_COMPARISON_GROUPS.map((group) => (
                  <Fragment key={group.category}>
                    <tr className="bg-gray-50/80">
                      <th
                        colSpan={3}
                        scope="colgroup"
                        className="px-6 py-3 text-xs font-semibold tracking-wide text-gray-900"
                      >
                        {group.category}
                      </th>
                    </tr>
                    {group.items.map((item) => (
                      <tr key={`${group.category}-${item.name}`} className="hover:bg-gray-50/50">
                        <td className="px-6 py-3.5 text-gray-700">{item.name}</td>
                        <td className="px-6 py-3.5 text-center">
                          {renderFeatureCell(item.community, 'Community', item.name)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {renderFeatureCell(item.pro, 'Pro', item.name)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paid Support Info Card */}
          <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50/70 p-8 shadow-sm">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold tracking-tight text-gray-900">
                  Support (Paid Engineering Support)
                </h3>
                <p className="mt-3 text-sm leading-6 text-gray-600 max-w-3xl">
                  For open-source self-hosters or teams needing extra engineering assistance, delivered directly by our core engineering team on an hourly basis.
                </p>

                <ul className="mt-5 grid grid-cols-1 gap-3 text-sm text-gray-700 md:grid-cols-3">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Covers Email, Slack, and live Remote Sessions</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Private cloud deployment guidance, performance tuning, and troubleshooting</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Billed per actual hours used with flexible scheduling and no long-term lock-in</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 lg:w-80 lg:flex-shrink-0">
                <div className="flex items-baseline whitespace-nowrap">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">$150</span>
                  <span className="ml-1.5 text-sm font-medium text-gray-500">/ hour</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Pay-as-you-go • PayPal / Credit Card accepted
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Includes Email / Slack / live Remote Session
                </p>
                <div className="mt-4">
                  <a
                    href="mailto:dev@coneshare.com?subject=ConeShare%20Support%20Session%20Inquiry"
                    className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
                  >
                    Book Support Session
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Comparison vs. Competitors */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Cost Comparison
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Estimated annual expenses based on full virtual dataroom (VDR) features, dynamic watermarks, and NDA click-through gates.
            </p>
          </div>

          <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-900">Comparison Dimension</th>
                  <th className="px-6 py-4 font-semibold text-gray-900">
                    DocSend
                    <span className="block text-xs font-normal text-gray-500">Advanced Data Rooms</span>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-900">
                    Papermark
                    <span className="block text-xs font-normal text-gray-500">Cloud Data Rooms (EUR list)</span>
                  </th>
                  <th className="px-6 py-4 font-semibold text-gray-900 bg-gray-50">
                    ConeShare
                    <span className="block text-xs font-normal text-gray-500">Managed BYOC (Private Cloud)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">Pricing model (annual basis)</td>
                  <td className="px-6 py-4 text-gray-600">$180/mo (includes 3 seats) + $60/user/mo</td>
                  <td className="px-6 py-4 text-gray-600">~$107/mo (€99, includes 3 seats) + ~$36/user/mo</td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    $1,999 / year managed open-source (unlimited seats)
                    <span className="block text-xs font-normal text-gray-500">
                      Add $2,999 / year if Pro enterprise features are needed
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    10-person team annual cost
                    <span className="block text-xs text-gray-400">3 base seats + 7 added seats</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    $7,200 / year
                    <span className="block text-xs text-gray-400">$11,160 if billed monthly</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    ~$4,300 / year (€3,960)
                    <span className="block text-xs text-gray-400">~€5,904 if billed monthly</span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    <span>$1,999 / year</span>
                    <span className="text-xs text-gray-500"> + ~$480 cloud ≈ </span>
                    <strong>~$2,479 / year</strong>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    25-person team annual cost
                    <span className="block text-xs text-gray-400">3 base seats + 22 added seats</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    $18,000 / year
                    <span className="block text-xs text-gray-400">$27,360 if billed monthly</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    ~$10,700 / year (€9,900)
                    <span className="block text-xs text-gray-400">~€14,724 if billed monthly</span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    <span>$1,999 / year</span>
                    <span className="text-xs text-gray-500"> + ~$600 cloud ≈ </span>
                    <strong>~$2,599 / year</strong>
                    <span className="block text-xs text-gray-500">Save ~86% vs. DocSend</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    50-person team annual cost
                    <span className="block text-xs text-gray-400">3 base seats + 47 added seats</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    $36,000 / year
                    <span className="block text-xs text-gray-400">$54,360 if billed monthly</span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    ~$21,400 / year (€19,800)
                    <span className="block text-xs text-gray-400">~€29,424 if billed monthly</span>
                  </td>
                  <td className="px-6 py-4 text-gray-900">
                    <span>$1,999 / year</span>
                    <span className="text-xs text-gray-500"> + ~$960 cloud ≈ </span>
                    <strong>~$2,959 / year</strong>
                    <span className="block text-xs text-gray-500">Save ~92% vs. DocSend</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">Open-source self-hosted version includes VDR?</td>
                  <td className="px-6 py-4 text-gray-500">Closed-source SaaS only</td>
                  <td className="px-6 py-4 text-gray-500">Free self-hosted version excludes datarooms</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    Open-source edition includes full VDR features
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">Physical data residency</td>
                  <td className="px-6 py-4 text-gray-600">DocSend platform</td>
                  <td className="px-6 py-4 text-gray-600">Papermark platform</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    Your own AWS, GCP, or Azure VPC
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">Data and migration freedom</td>
                  <td className="px-6 py-4 text-gray-600">Tied to vendor platform</td>
                  <td className="px-6 py-4 text-gray-600">Tied to vendor platform</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    No vendor lock-in, can be handed over to internal IT at any time
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-gray-50 py-20 sm:py-24 border-t border-gray-200">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Frequently Asked Questions</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">FAQ</p>
          </div>

          <div className="mt-12 space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-xl border border-gray-200 bg-white transition shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left text-base font-semibold text-gray-900 hover:bg-gray-50/80 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-gray-900' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-sm text-gray-600 leading-relaxed border-t border-gray-100 bg-gray-50/40">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Help Box */}
          <div className="mt-16 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Have questions about architecture or compliance?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Whether you need custom storage mounts, private network configurations, or compliance reports, feel free to reach out to our engineering team.
            </p>
            <div className="mt-6 flex justify-center gap-4">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Architecture%20Inquiry"
                className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
              >
                Email Engineering Team
              </a>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
              >
                View Live Demo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
