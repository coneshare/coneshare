import Link from 'next/link';
import { features, solutions } from '../lib/content';
import { HomepageMockupCarousel } from '../components/HomepageMockupCarousel';
import { MultiFormatPreviewMockup } from '../components/MultiFormatPreviewMockup';
import { VideoWalkthroughModal } from '../components/VideoWalkthroughModal';

export const metadata = {
  title: 'Open-Source Self-Hosted Virtual Data Room (VDR) & Document Tracking - ConeShare',
  description:
    'Stop paying expensive per-seat SaaS subscriptions. Connect directly to your existing storage to add access gates, leak-proof dynamic watermarks, and page-by-page engagement tracking.',
};

export default function HomePage() {
  const featuredUseCaseSlugs = ['secure-fundraising', 'engagement-visibility', 'timely-follow-ups'];
  const primaryUseCases = featuredUseCaseSlugs
    .map((slug) => solutions.find((solution) => solution.slug === slug))
    .filter(Boolean);

  const enUseCases = [
    {
      slug: 'secure-fundraising',
      name: 'Seed & Venture Fundraising',
      description:
        'Track investor dwell time slide by slide. Discover forwarded pitch decks and uncover the decision-making partners who actually write the checks.',
      icon: primaryUseCases[0]?.icon,
    },
    {
      slug: 'engagement-visibility',
      name: 'Enterprise B2B Sales',
      description:
        'Enforce NDA agreements before prospects review custom pricing. Full-screen dynamic watermarks prevent competitor price shopping and photo leaks.',
      icon: primaryUseCases[1]?.icon,
    },
    {
      slug: 'timely-follow-ups',
      name: 'M&A Diligence & Legal Audits',
      description:
        'Multi-link dataroom partitioning keeps buyer groups and Q&A threads strictly isolated. Deploy on-premise to comply with stringent audit mandates.',
      icon: primaryUseCases[2]?.icon,
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <div className="bg-white">
        <div className="relative isolate px-6 pt-14 lg:px-8">
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
          <div className="pt-4 sm:pt-6 pb-12 sm:pb-16">
            <div className="mx-auto max-w-3xl text-center">
              {/* Release Pill */}
              <div className="mb-8 flex justify-center">
                <Link
                  href="/blog/coneshare-v1-11-0-dataroom-redesign-banner-gallery-download-all"
                  className="inline-flex items-center gap-x-2 rounded-full border border-gray-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-300"
                >
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>ConeShare v1.11 is live: Redesigned dataroom visitor UI with whole-room batch downloads &rarr;</span>
                </Link>
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                The Self-Hosted Virtual Data Room for Teams That Own Their Data
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
                Stop paying expensive per-seat SaaS subscriptions. Add access controls, dynamic anti-leak watermarks, and page-by-page engagement tracking on top of your existing storage—no file migration required.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="/virtual-dataroom"
                  className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  Explore Virtual Datarooms
                </Link>
                <VideoWalkthroughModal
                  buttonLabel="Watch Walkthrough (2 mins)"
                  videoUrl="https://cdn.coneshare.com/coneshare-walkthrough-v1.mp4"
                  posterUrl="https://cdn.coneshare.com/coneshare.jpg"
                />
              </div>
            </div>
            <div className="mt-16 sm:mt-20 mx-auto max-w-5xl px-6 lg:px-8">
              <HomepageMockupCarousel />
            </div>
          </div>
        </div>
      </div>

      {/* Why Coneshare Section */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Why ConeShare</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Internal storage was built for collaboration, not secure external distribution
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Cloud drives work well inside teams, but standard shared links lose all control once sent. You cannot see who opened the file, how long they lingered on each page, or stop them from forwarding confidential proposals.
              </p>

              {/* Founder's Note Card */}
              <div className="mt-6 rounded-xl border border-gray-200/90 bg-gray-50/70 p-5 text-sm text-gray-700 shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
                  <span className="text-base">💡</span>
                  <span>Why we built ConeShare</span>
                </div>
                <p className="italic text-gray-600 leading-relaxed text-[13.5px]">
                  &ldquo;Tools like DocSend charge over $100 per user every month just to see who opened a document. We built ConeShare so teams can keep their own storage, enforce leak-proof dynamic watermarks, and track reading engagement at a fraction of the cost.&rdquo;
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3 pt-2.5 border-t border-gray-200/70 text-xs text-gray-500">
                  <Link href="/about" className="font-medium text-gray-900 hover:underline">
                    Read our story &amp; principles &rarr;
                  </Link>
                  <span>•</span>
                  <Link href="/alternatives/docsend" className="font-medium text-gray-900 hover:underline">
                    Compare with DocSend &rarr;
                  </Link>
                </div>
              </div>
            </div>

            <div className="space-y-6 text-base leading-7 text-gray-600 lg:col-span-7 lg:pl-6">
              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">1</span>
                  Direct Storage Connection, Zero Migration
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Connect directly to Nextcloud, local storage, or S3 buckets. Updates automatically stay in sync without moving your files or changing team habits.
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">2</span>
                  Full Control After Sending
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Revoke links, change passwords, or restrict downloads at any time. Enforce NDA gates and dynamic watermarks to end &ldquo;sent and lost.&rdquo;
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">3</span>
                  Predictable Flat Cost, Zero Per-Seat Tax
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Break free from exorbitant per-user monthly SaaS fees. Self-host with predictable costs and no artificial limits on team seats.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link href="/demo" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  Try the live demo yourself <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Honest Fit Section */}
      <div className="border-y border-gray-200/80 bg-gray-50/60 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Is ConeShare right for your team?
            </h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200/80 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-900">
                <span className="text-emerald-600 font-bold">✓</span> Built for teams that:
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Frequently share pitch decks, enterprise proposals, or diligence packages and need exact viewer engagement down to the second.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Insist on keeping files in existing storage without migrating sensitive data to proprietary cloud SaaS vendors.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Require viewer-specific dynamic watermarks, mandatory NDA gates, and instant link revocation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Must comply with strict data residency mandates (GDPR, HIPAA) requiring 100% self-hosted or air-gapped deployment.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <span className="text-gray-400 font-bold">✕</span> Not a good fit if you:
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Only do casual everyday file sharing where standard cloud links already suffice.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Are searching for a raw bulk object storage replacement for primary archival.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Only need real-time multi-cursor document co-editing with no external sharing or tracking needs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Have zero requirement for watermarks, confidentiality gates, or viewer telemetry.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Core Capabilities</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Enterprise-grade security and document tracking without changing your storage habits
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              Virtual data rooms, dynamic watermarks, zero-install file previews, and page-level analytics in one unified platform.
            </p>
          </div>

          {/* Two Hero Feature Showcase Cards */}
          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2">
            
            {/* Killer Card 1: Virtual Data Rooms */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Virtual Data Rooms
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Structured data rooms built for diligence, audits, and commercial proposals. Support multi-link scoping to isolate visible directories and download permissions independently per buyer group.
                </p>
              </div>

              {/* Streamlined Minimalist Mockup: 2-Tier Permission Scope */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">DIR</span>
                    <span className="font-semibold text-gray-900">Enterprise Proposal (Acme Corp)</span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {/* Scope 1: Procurement & Legal Link */}
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-950">Procurement &amp; Legal Link</span>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        NDA Signed ✓
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-600">
                      <span>Custom Pricing Model + Master Agreement</span>
                      <span className="font-mono text-[10px] text-indigo-700 font-medium">Watermarked Preview</span>
                    </div>
                  </div>

                  {/* Scope 2: Evaluation Link */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">Technical Evaluation Link</span>
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        Password Only
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span>Architecture Whitepaper</span>
                      <span className="font-mono text-[10px] text-amber-700 font-medium">🔒 Commercials Locked</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/virtual-dataroom"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-indigo-600 transition"
                >
                  Explore virtual data rooms <span className="ml-1" aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>

            {/* Killer Card 2: Dynamic Watermarking */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Dynamic Anti-Leak Watermarking
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Tile the viewer&apos;s verified email, IP address, and timestamp across the entire document. Balances crisp reading comfort with undeniable leak deterrents to stop phone cameras and screenshots at the source.
                </p>
              </div>

              {/* Dual-State Contrast: Raw vs Protected */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-150 pb-2.5 text-xs">
                  <span className="font-semibold text-gray-900">Leak Deterrence Verification</span>
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  {/* Left: Raw / Standard Link */}
                  <div className="rounded-lg border border-dashed border-gray-250 bg-gray-50/70 p-2.5 text-[10px]">
                    <div className="flex items-center justify-between text-gray-500 pb-1.5 border-b border-gray-200/60">
                      <span className="font-medium">Standard Cloud Link</span>
                      <span className="text-amber-600 font-mono text-[9px] font-bold">UNPROTECTED</span>
                    </div>
                    <div className="mt-2 space-y-1 text-gray-400">
                      <p className="font-medium text-gray-600">Pricing Schedule</p>
                      <p>$45,000 / year</p>
                      <p className="text-[9px] text-red-500 pt-1">No leak trail</p>
                    </div>
                  </div>

                  {/* Right: Coneshare Protected Link */}
                  <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/30 p-2.5 text-[10px] overflow-hidden">
                    {/* Tiled Watermark Overlay */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-around -rotate-12 opacity-35 select-none z-10">
                      <span className="whitespace-nowrap font-mono text-[8px] font-bold text-red-700">
                        alex@acmecorp.com • 2026-09-28
                      </span>
                      <span className="whitespace-nowrap font-mono text-[8px] font-bold text-red-700 pl-4">
                        alex@acmecorp.com • 2026-09-28
                      </span>
                    </div>

                    <div className="relative z-0">
                      <div className="flex items-center justify-between text-emerald-950 pb-1.5 border-b border-emerald-200/60 font-medium">
                        <span>ConeShare Protected</span>
                        <span className="text-emerald-600 font-mono text-[9px] font-bold">✓ PROTECTED</span>
                      </div>
                      <div className="mt-2 space-y-1 text-gray-700">
                        <p className="font-medium text-gray-900">Pricing Schedule</p>
                        <p>$45,000 / year</p>
                        <p className="text-[9px] text-emerald-700 font-semibold pt-1">Recipient verified</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/features/dynamic-watermarking"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  Explore dynamic watermarks <span className="ml-1" aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>

            {/* Killer Card 3: Multi-Format Online Preview */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Multi-Format Online Preview
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Preview PDFs, Office documents, multi-sheet spreadsheets, Apple HEIC photos, and videos directly in any modern browser with zero client installs.
                </p>
              </div>

              <MultiFormatPreviewMockup />

              <div className="mt-6 pt-2">
                <Link
                  href="/features/online-document-preview"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  Explore online preview <span className="ml-1" aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>

            {/* Killer Card 4: Page-by-Page Analytics */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Page-by-Page Reading Analytics
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Track exact reading seconds per slide, completion rates, and video scrubbing intervals. Uncover internal forwarding trails and identify high-intent decision-makers before your next follow-up.
                </p>
              </div>

              {/* Streamlined Minimalist Mockup: 3-Bar Intent Contrast */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-gray-900">alex@acmecorp.com</span>
                  </div>
                  <span className="text-gray-500 font-mono">4m 32s total</span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Slide 1 • Solution Overview</span>
                      <span className="font-mono">12s</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gray-300" style={{ width: '12%' }} />
                    </div>
                  </div>

                  <div className="rounded-lg bg-emerald-50/90 p-2.5 border border-emerald-200">
                    <div className="flex justify-between text-xs font-semibold text-emerald-950">
                      <span>Slide 2 • Scope &amp; Custom Pricing</span>
                      <span className="font-mono text-emerald-700 font-bold">2m 14s</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-full bg-emerald-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: '85%' }} />
                    </div>
                    <div className="mt-1.5 text-[10px] font-medium text-emerald-800">
                      51% of session • Key Interest Point
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Slide 3 • Implementation Timeline</span>
                      <span className="font-mono">18s</span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-gray-300" style={{ width: '18%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/features/advanced-analytics"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  Explore engagement analytics <span className="ml-1" aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>

          </div>

          {/* Minimalist Centered Feature Matrix Link */}
          <div className="mt-14 text-center">
            <Link
              href="/features"
              className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
            >
              See full features <span className="ml-1" aria-hidden="true">&rarr;</span>
            </Link>
          </div>

        </div>
      </div>

      {/* Solutions Section */}
      <div id="solutions" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Use Cases</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Purpose-built compliance and security for high-stakes external sharing
            </h2>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-5xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {enUseCases.map((solution) => (
                <div key={solution.slug} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    {solution.icon && <solution.icon className="h-5 w-5 flex-none text-gray-900" aria-hidden="true" />}
                    {solution.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                    <p className="flex-auto">{solution.description}</p>
                    <p className="mt-6">
                      <Link href={`/solutions/${solution.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                        Learn more <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 text-center">
              <Link href="/solutions" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                See all use cases <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
