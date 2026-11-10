'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

export function PricingContent() {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [activeFaq, setActiveFaq] = useState(null);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: 'Why pay for Managed BYOC if the Community Edition is open source?',
      a: 'The Community Edition includes all core features, and we do not restrict security tools like NDA gates or dynamic watermarks. However, maintaining video transcoding, document rendering, SSL certificates, and database backups requires ongoing operational time. With Managed BYOC, our team handles setup and maintenance in your cloud, saving your internal engineers from day-to-day operations.',
    },
    {
      q: 'How should a team of 20-40 people choose between Managed BYOC (Tier 2) and Enterprise (Tier 3)?',
      a: 'The choice depends on whether you need identity integration and custom capabilities. If standard email and password login works for you, Managed BYOC is a flat price regardless of whether you have 10 or 50 people. If your IT or security team requires SSO (Okta, Azure AD), LDAP directory sync, cross-document full-text search, audit log exports, or bespoke features, choose Enterprise.',
    },
    {
      q: 'What happens if we stop subscribing to Managed BYOC? Do you offer refunds?',
      a: 'During the first 14 days after deployment, we provide a full refund if network or storage issues prevent smooth operation. Because the software and data run inside your own cloud account, ending a subscription will never shut down your servers or lock your files. We hand over the deployment credentials to your team, and your internal staff can manage the instance directly.',
    },
    {
      q: 'How much does raw cloud infrastructure (AWS / GCP / Azure) cost, and how should we size our server?',
      a: 'Server requirements depend on document and video processing volume rather than headcount. For teams sharing mainly PDFs, a 4 vCPU / 4GB RAM instance (~$40-$60/month on AWS or GCP) can comfortably support 50 users. If you have high volumes of HD video transcoding, we recommend 8 vCPU / 16GB RAM (~$120-$160/month). You pay your cloud provider directly with no markups from us.',
    },
    {
      q: 'How does feature co-development and priority delivery work in Enterprise?',
      a: "You discuss requirements directly with our core engineering team. If a requested feature (such as an auth plugin, webhook, or compliance report) aligns with ConeShare's product roadmap, we prioritize and ship it within 2-4 weeks at no additional charge. For bespoke logic specific to your company, we can maintain an independent private branch.",
    },
    {
      q: 'Can we purchase an Enterprise license for offline deployment without granting VPC access?',
      a: 'Yes. For organizations with strict security policies or air-gapped intranet environments, Enterprise can be delivered as an offline commercial license file (.lic) to enable SSO, LDAP, full-text search, and audit logs on your own self-managed servers.',
    },
    {
      q: 'How does billing and invoicing work for annual contracts?',
      a: 'We support corporate bank wire transfers (ACH, Wire, SWIFT). Once the contract is confirmed, we issue a formal commercial invoice along with our standard corporate agreement.',
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative isolate px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:px-8">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #d1d5db 1px, transparent 0)',
            backgroundSize: '20px 20px',
            maskImage: 'linear-gradient(to bottom, white, transparent)',
          }}
          aria-hidden="true"
        />

        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Plans & Pricing
          </h1>

          <p className="mt-4 text-base leading-7 text-gray-600 max-w-2xl mx-auto">
            Deploy our open-source version for free with Docker, let our team manage deployment
            and maintenance in your own private cloud, or choose Enterprise for SSO and compliance audit logs.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 flex items-center justify-center">
            <div className="relative flex items-center rounded-full bg-gray-100 p-1 border border-gray-200">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  billingCycle === 'monthly'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  billingCycle === 'annual'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Annual
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
          {/* Tier 1: Community */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Community</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                For technical teams that want complete self-managed control with open-source software.
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-4xl font-bold tracking-tight text-gray-900">$0</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ free forever</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">MIT Open Source License • Self-hosted via Docker</p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">Included features:</p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Core VDR features: structured folders, dynamic watermarks, NDA gates, Q&A, and page-by-page analytics</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Unlimited team members and share links</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Mount local storage, Nextcloud, Google Drive, or Dropbox</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Self-managed Docker containers, logs, SSL certificates, and database backups</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Community support via GitHub Discussions and issue tracker</span>
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
                Deploy with Docker
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

          {/* Tier 2: Managed BYOC (Hero / Most Popular) */}
          <div className="relative flex flex-col justify-between rounded-2xl border-2 border-gray-900 bg-white p-8 shadow-md transition hover:shadow-lg">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-gray-900 px-3.5 py-1 text-xs font-semibold text-white shadow-sm">
                Most Popular
              </span>
            </div>

            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Managed BYOC</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                Our team handles deployment and maintenance, while data and instances remain in your own cloud account.
              </p>

              <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {billingCycle === 'annual' ? (
                  <>
                    <div className="flex items-baseline whitespace-nowrap">
                      <span className="text-4xl font-bold tracking-tight text-gray-900">$3,999</span>
                      <span className="ml-1.5 text-sm font-medium text-gray-500">/ year</span>
                    </div>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                      ~$333/month
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline whitespace-nowrap">
                      <span className="text-4xl font-bold tracking-tight text-gray-900">$399</span>
                      <span className="ml-1.5 text-sm font-medium text-gray-500">/ month</span>
                    </div>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 whitespace-nowrap">
                      3-mo minimum
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {billingCycle === 'annual'
                  ? '$500 setup fee waived • 14-day refund guarantee'
                  : 'Total first payment $1,697 • 14-day refund guarantee'}
              </p>

              <div className="mt-6 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  Includes everything in Community, plus:
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Deployed directly in your own private cloud VPC with isolated storage</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>White-label branding: remove Powered by badge, custom domain, and brand colors</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Unlimited team seats with zero visitor fees</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Official turnkey setup: custom domain, automated SSL certificates, and log collection</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Performance tuning for document rendering and video streaming</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Off-peak security updates and regular database backup verification</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Zero vendor lock-in: if you cancel, the open-source instance keeps running in your cloud</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Technical support: 24-hour email response directly from our engineering team</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="mailto:dev@coneshare.com?subject=Managed%20BYOC%20Deployment%20Inquiry"
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition"
              >
                Request Managed Deployment
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                Async onboarding via email and Slack
              </p>
            </div>
          </div>

          {/* Tier 3: Enterprise */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition hover:border-gray-300">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-gray-900">Enterprise</h3>
              <p className="mt-2 text-sm text-gray-600 min-h-[40px]">
                For organizations that require SSO single sign-on, full-text search, audit logging, or custom integrations.
              </p>

              <div className="mt-6 flex items-baseline whitespace-nowrap">
                <span className="text-sm font-medium text-gray-500 mr-1.5">from</span>
                <span className="text-4xl font-bold tracking-tight text-gray-900">$9,999</span>
                <span className="ml-1.5 text-sm font-medium text-gray-500">/ year</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">Billed annually • Custom onboarding roadmap</p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <p className="text-xs font-semibold text-gray-900">
                  Includes everything in Managed BYOC, plus:
                </p>
                <ul className="mt-4 space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>SSO and directory sync (SAML 2.0 / OIDC / Okta / Azure AD / LDAP)</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Cross-document full-text search (PDF, Office, and Markdown content)</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Compliance audit logs and security event export</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Multi-node high-availability clusters or fully air-gapped offline deployment</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Co-development: common features prioritized in 2-4 weeks; dedicated private branches for custom logic</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span>Dedicated Slack channel with priority resolution within 24 hours</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100">
              <a
                href="mailto:dev@coneshare.com?subject=ConeShare%20Enterprise%20Inquiry"
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 transition"
              >
                Contact Engineering Team
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
              <p className="mt-2 text-center text-xs text-gray-500">
                POC trial and compliance support available
              </p>
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
                    $3,999 / year flat rate (unlimited seats)
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
                    <span>$3,999 / year</span>
                    <span className="text-xs text-gray-500"> + ~$480 cloud ≈ </span>
                    <strong>~$4,479 / year</strong>
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
                    <span>$3,999 / year</span>
                    <span className="text-xs text-gray-500"> + ~$600 cloud ≈ </span>
                    <strong>~$4,599 / year</strong>
                    <span className="block text-xs text-gray-500">Save 74% vs. DocSend</span>
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
                    <span>$3,999 / year</span>
                    <span className="text-xs text-gray-500"> + ~$960 cloud ≈ </span>
                    <strong>~$4,959 / year</strong>
                    <span className="block text-xs text-gray-500">Save 86% vs. DocSend</span>
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-gray-900">Open-source self-hosted version includes VDR?</td>
                  <td className="px-6 py-4 text-gray-500">Closed-source SaaS only</td>
                  <td className="px-6 py-4 text-gray-500">Free self-hosted version excludes Data Rooms</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">
                    100% open source includes full VDR features
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
