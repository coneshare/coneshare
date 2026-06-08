import Link from 'next/link';
import { features, solutions } from '../lib/content';
import { Carousel } from '../components/Carousel';

const workflowImages = [
  { src: '/screenshots/feat-upload.png', alt: 'Screenshot of the document upload process' },
  { src: '/screenshots/feat-sharing.png', alt: 'Screenshot of creating a secure share link' },
  { src: '/screenshots/feat-watermark.png', alt: 'Screenshot of dynamic watermarking' },
  { src: '/screenshots/feat-analytics.png', alt: 'Screenshot of document analytics and viewer insights' },
  { src: '/screenshots/feat-automations.png', alt: 'Screenshot of document activities automations' },
];

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
          <div className="py-24 sm:py-32 lg:py-40">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Document Control & Intelligence Layer</p>
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Turn your cloud storage into a secure, trackable data room
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                Coneshare helps teams keep existing storage workflows while adding controlled sharing, visibility,
                and action workflows for external document distribution.
              </p>
              <p className="mt-3 text-sm font-medium text-gray-500">
                Keep your storage workflow. Add secure links, data rooms, tracking, and automation.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="/nextcloud-vdr"
                  className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  Explore Nextcloud VDR
                </Link>
                <Link href="/integrations/nextcloud" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  See integration details <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
            <div className="mt-16 sm:mt-20">
              <Carousel images={workflowImages} />
            </div>

    {/*
            <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-left">
                <p className="text-sm font-semibold text-gray-900">Control Layer</p>
                <p className="mt-2 text-sm text-gray-600">Apply secure link controls, download rules, watermarking, and data room permissions.</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-left">
                <p className="text-sm font-semibold text-gray-900">Intelligence Layer</p>
                <p className="mt-2 text-sm text-gray-600">Track views, revisits, downloads, and page-level behavior across documents and data rooms.</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-left">
                <p className="text-sm font-semibold text-gray-900">Action Layer</p>
                <p className="mt-2 text-sm text-gray-600">Route high-signal events to Slack, webhooks, and internal systems for fast follow-up.</p>
              </div>
            </div>
     */}

          </div>
        </div>
      </div>

      {/* Why Coneshare Section */}
      <div className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Why Coneshare Exists</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Storage is not the same as controlled distribution
              </h2>
            </div>
            <div className="space-y-5 text-base leading-7 text-gray-600 lg:col-span-7">
              <p>
                Cloud drives are good at holding files, but sensitive external sharing often needs stronger controls,
                clearer viewer context, and a workflow for what happens after someone opens a document.
              </p>
              <p>
                Coneshare is built for teams that want those controls without replacing their existing storage workflow.
                Import selected files into a controlled distribution layer, then add secure links, data rooms,
                engagement visibility, and event-driven follow-up.
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                <Link href="/about" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  Read the product story <span aria-hidden="true">→</span>
                </Link>
                <Link href="/demo" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  Try the live demo <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-gray-900">Core Features</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Add VDR workflows without replacing your storage workflow
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Start with secure control over shared links and data rooms, then add engagement intelligence and workflow actions on top of your current stack.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
              {features.map((feature) => (
                <div key={feature.slug} className="relative pl-14">
                  <dt className="text-base font-semibold leading-7 text-gray-900">
                    <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
                      <feature.icon className="h-4 w-4 text-white" aria-hidden="true" />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="mt-2 text-base leading-7 text-gray-600">{feature.description}</dd>
                  <dd className="mt-4">
                    <Link href={`/features/${feature.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                      Learn more <span aria-hidden="true">→</span>
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Solutions Section */}
      <div id="solutions" className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-gray-900">Use Cases</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Built for high-stakes sharing workflows
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              See how teams use Coneshare to add control and visibility where plain storage links are not enough.
            </p>
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
