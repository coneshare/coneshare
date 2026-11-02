import Link from 'next/link';
import { features, solutions } from '../lib/content';
import { HomepageMockupCarousel } from '../components/HomepageMockupCarousel';
import { MultiFormatPreviewMockup } from '../components/MultiFormatPreviewMockup';

export default function HomePage() {
  const featuredUseCaseSlugs = ['secure-fundraising', 'engagement-visibility', 'timely-follow-ups'];
  const primaryUseCases = featuredUseCaseSlugs
    .map((slug) => solutions.find((solution) => solution.slug === slug))
    .filter(Boolean);

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
                  <span>Coneshare v1.11 is out: Redesigned dataroom viewer & whole-room downloads</span>
                  <span className="text-gray-400">→</span>
                </Link>
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                The Self-Hosted Data Room for Teams That Own Their Data
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
                Control document distribution, apply dynamic watermarks, and inspect viewer engagement on top of your existing storage without moving your files to third-party servers.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="/virtual-dataroom"
                  className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  Explore Virtual Datarooms
                </Link>
                <Link href="/demo" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  View Live Demo <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>Open-source &amp; self-hostable</span>
                <span className="hidden sm:inline">•</span>
                <span>Keep files in your own storage</span>
                <span className="hidden sm:inline">•</span>
                <span>Docker-ready deployment</span>
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
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Why Coneshare</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Internal storage was not built for external sharing
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Cloud drives work well for internal teams, but standard links give you no visibility once files leave your organization. You cannot see who opened the document, which pages they read, or whether they forwarded it.
              </p>

              {/* Founder's Note Card */}
              <div className="mt-6 rounded-xl border border-gray-200/90 bg-gray-50/70 p-5 text-sm text-gray-700 shadow-sm">
                <div className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
                  <span>Why we built Coneshare</span>
                </div>
                <p className="italic text-gray-600 leading-relaxed text-[13.5px]">
                  &ldquo;DocSend charges $100 a month per user just to see who opened a file. We built Coneshare so teams can keep their own storage, protect sensitive documents with dynamic watermarks, and get full viewer tracking at a tenth of the price.&rdquo;
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3 pt-2.5 border-t border-gray-200/70 text-xs text-gray-500">
                  <Link href="/about" className="font-medium text-gray-900 hover:underline">
                    Read our story & principles →
                  </Link>
                  <span>•</span>
                  <Link href="/alternatives/docsend" className="font-medium text-gray-900 hover:underline">
                    Compare with DocSend →
                  </Link>
                </div>
              </div>
            </div>

            <div className="space-y-6 text-base leading-7 text-gray-600 lg:col-span-7 lg:pl-6">
              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">1</span>
                  Access rules
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Control entry with passwords, verified email gates, one-click NDA acceptance, and link expiration dates.
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">2</span>
                  Dynamic watermarks
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Stamp the recipient&apos;s email address and access time across every page of in-browser previews and downloaded files to prevent leaks.
                </p>
              </div>

              <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">3</span>
                  Page-level tracking
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  See exact reading time per slide, identify which pages were skipped, and receive instant alerts when a link gets shared with others.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <Link href="/demo" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  Try the live demo yourself <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Honest Fit Section: When to use (and when not to) */}
      <div className="border-y border-gray-200/80 bg-gray-50/60 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Is Coneshare right for you?
            </h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200/80 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-900">
                <span className="font-mono text-xs font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">YES</span>
                <span>Built for teams that:</span>
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Share confidential decks, proposals, or M&amp;A datarooms and need page-level viewing data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Keep files in existing storage without migrating to a public SaaS vendor.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Require viewer-specific watermarks, NDA gates, and instant link revocation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>Prioritize data sovereignty and prefer self-hosting with Docker.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <span className="font-mono text-xs font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">NO</span>
                <span>Not a good fit if you:</span>
              </h3>
              <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Share everyday files where standard cloud links are already plenty.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Need live co-editing instead of secure external document distribution.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">•</span>
                  <span>Have no requirement for watermarking, NDA gates, or viewer tracking.</span>
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
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Core Features</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Complete visibility and protection for shared files
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-600">
              Data rooms, dynamic watermarks, zero-install file previews, and page-level analytics in one place.
            </p>
          </div>

          {/* Two Hero Feature Showcase Cards */}
          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2">
            
            {/* Feature Card 1: Virtual Data Rooms */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Virtual Data Rooms
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Structure and share commercial proposals and diligence materials in minutes. Set independent folder-level access, enforce NDA gates, and provision granular permission links for every client or partner.
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
                        NDA Signed
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
                      <span className="font-medium text-gray-700">Evaluation Link</span>
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        Password Only
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span>Technical Architecture Deck</span>
                      <span className="font-mono text-[10px] text-amber-700 font-medium">Pricing Locked</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href="/features/virtual-data-rooms"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-indigo-600 transition"
                >
                  Explore virtual data rooms <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Feature Card 2: Dynamic Watermarking */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Dynamic Watermarking
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Deter leaks before they occur. Tiled watermarks dynamically burn the recipient&apos;s verified email, timestamp, and IP across previews and PDF downloads.
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
                        <span>Coneshare Link</span>
                        <span className="text-emerald-600 font-mono text-[9px] font-bold">PROTECTED</span>
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
                  Explore dynamic watermarks <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Feature Card 3: Multi-Format Online Preview */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Multi-Format Online Preview
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Preview PDFs, Office documents, multi-sheet spreadsheets, Apple HEIC photos, and video directly in any browser with zero client installs.
                </p>
              </div>

              {/* Interactive Tabbed Mock Viewer */}
              <MultiFormatPreviewMockup />

              <div className="mt-6 pt-2">
                <Link
                  href="/features/online-document-preview"
                  className="inline-flex items-center text-sm font-semibold text-gray-900 hover:text-emerald-600 transition"
                >
                  Explore online preview <span className="ml-1" aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Feature Card 4: Page-by-Page Analytics */}
            <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-gray-50/40 p-6 sm:p-8 shadow-sm hover:border-gray-300 transition">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  Page-by-Page Analytics
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Know which prospect is genuinely interested before your next call. Inspect exact reading time per slide and get alerted when proposals get forwarded.
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
                  Explore engagement analytics <span className="ml-1" aria-hidden="true">→</span>
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
              See full features <span className="ml-1" aria-hidden="true">→</span>
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
              Share proposals and client materials with real access controls
            </h2>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-5xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {primaryUseCases.map((solution) => (
                <div key={solution.slug} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    <solution.icon className="h-5 w-5 flex-none text-gray-900" aria-hidden="true" />
                    {solution.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                    <p className="flex-auto">{solution.description}</p>
                    <p className="mt-6">
                      <Link href={`/solutions/${solution.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                        Learn more <span aria-hidden="true">→</span>
                      </Link>
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 text-center">
              <Link href="/solutions" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                See all use cases <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
