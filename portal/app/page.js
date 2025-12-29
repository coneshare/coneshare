import { ShieldCheck, LineChart, Droplets, HardDrive } from 'lucide-react';

const features = [
  {
    name: 'Secure Document & Dataroom Sharing',
    description: 'Share sensitive documents with confidence. Coneshare\'s link-based sharing system gives you complete control over who sees your content and how they access it.',
    icon: ShieldCheck,
  },
  {
    name: 'Advanced Analytics & Tracking',
    description: 'Gain actionable insights into how your shared documents are being consumed with real-time, page-by-page analytics.',
    icon: LineChart,
  },
  {
    name: 'Dynamic Watermarking',
    description: 'Prevent unauthorized sharing and protect intellectual property with dynamic watermarks that are applied on the fly.',
    icon: Droplets,
  },
  {
    name: 'Self-Hosted & Enterprise-Ready',
    description: 'Built for security-conscious organizations, Coneshare runs entirely on your own infrastructure, giving you total data sovereignty.',
    icon: HardDrive,
  },
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
                Coneshare is an enterprise-grade, self-hosted document sharing and virtual data room platform. It provides the advanced security, control, and analytics of leading services, but on your own infrastructure.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
                <a
                  href="/signup"
                  className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Get started
                </a>
                <a href="#" className="text-sm font-semibold leading-6 text-gray-900">
                  Learn more <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-blue-600">Total Control</h2>
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
                    <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                      <feature.icon className="h-6 w-6 text-white" aria-hidden="true" />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="mt-2 text-base leading-7 text-gray-600">{feature.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
