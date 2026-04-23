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
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Turn document activity
                <br />
                into real-time insights
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                Know when prospects engage with your content and trigger actions instantly with real-time tracking, workflow automation, and integrations for Slack and webhooks.
              </p>
              <p className="mt-3 text-sm font-medium text-gray-500">
                Track engagement, align teams, and automate timely follow-ups.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="/demo"
                  className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  View live demo
                </Link>
                <Link href="/features" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  See core features <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
            <div className="mt-16 sm:mt-20">
              <Carousel images={workflowImages} />
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
              Secure sharing, engagement visibility, and automation
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Start with secure document and dataroom sharing, then layer in engagement awareness and automated alerts so teams can react at the right moment.
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
              Workflows built for deal momentum
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              See how teams use Coneshare to detect engagement, align quickly, and follow up while interest is highest.
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
