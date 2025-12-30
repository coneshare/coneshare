import Link from 'next/link';
import { features, solutions } from '../lib/content';
import { Carousel } from '../components/Carousel';

const workflowImages = [
  { src: '/screenshots/upload.png', alt: 'Screenshot of the document upload process' },
  { src: '/screenshots/sharing.png', alt: 'Screenshot of creating a secure share link' },
  { src: '/screenshots/watermark.png', alt: 'Screenshot of dynamic watermarking' },
  { src: '/screenshots/analytics.png', alt: 'Screenshot of document analytics and viewer insights' },
];

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <div className="bg-white">
        <div className="relative isolate px-6 pt-14 lg:px-8">
          <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
            <div className="text-center">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                Secure Document Sharing,
                <br />
                On Your Terms
              </h1>
              <p className="mt-6 text-lg leading-8 text-gray-600">
                Coneshare is an open-source, self-hosted document sharing and virtual data room platform. It provides the advanced security, control, and analytics of leading services, but on your own infrastructure.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <Link
                  href="https://github.com/coneshare/coneshare-compose"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
                >
                  Get started
                </Link>
                <Link href="/features" className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                  Learn more <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Carousel Section */}
      <div className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-gray-900">Simple & Powerful Workflow</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              From Upload to Analysis in Three Steps
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Coneshare streamlines secure document sharing. See how easy it is to upload your files, create protected links, and track engagement with detailed analytics.
            </p>
          </div>
          <div className="mt-16 sm:mt-20">
            <Carousel images={workflowImages} />
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-gray-900">Total Control</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to share documents securely
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              From link-based sharing with granular access controls to detailed analytics, Coneshare provides a comprehensive solution for modern document workflows.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
              {features.map((feature) => (
                <div key={feature.name} className="relative pl-16">
                  <dt className="text-base font-semibold leading-7 text-gray-900">
                    <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900">
                      <feature.icon className="h-6 w-6 text-white" aria-hidden="true" />
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
              Built for demanding workflows
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Coneshare provides the security and control required by venture capital, legal firms, and sales teams to manage their most sensitive documents.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-5xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {solutions.map((solution) => (
                <div key={solution.slug} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    <solution.icon className="h-5 w-5 flex-none text-gray-900" aria-hidden="true" />
                    {solution.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                    <p className="flex-auto">{solution.description}</p>
                    <p className="mt-6 text-sm leading-6 text-gray-500 italic">"{solution.quote}"</p>
                    <p className="mt-6">
                      <Link href={`/solutions/${solution.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                        Learn more <span aria-hidden="true">→</span>
                      </Link>
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
