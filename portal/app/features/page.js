import Link from 'next/link';
import { features } from '../../lib/content';

const SITE_URL = 'https://www.coneshare.com';

export const metadata = {
  title: 'Features | Coneshare',
  description: 'Explore Coneshare features for real-time document visibility, engagement awareness, and workflow automation.',
  keywords: [
    'secure document sharing features',
    'dataroom security features',
    'document engagement analytics',
    'workflow automation features',
    'self-hosted document platform',
  ],
  alternates: {
    canonical: '/features',
  },
};

export default function FeaturesPage() {
  const featureListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Coneshare Features',
    itemListElement: features.map((feature, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/features/${feature.slug}`,
      name: feature.name,
      description: feature.description,
    })),
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-gray-900">Core Features</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Secure sharing, engagement visibility, and automation
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Start with secure document and dataroom sharing, then add engagement insights and workflow automations through Slack and webhooks.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
            {features.map((feature) => (
              <div key={feature.slug} className="relative rounded-lg border border-gray-200 bg-white p-8 pl-16 shadow-sm">
                <dt className="text-base font-semibold leading-7 text-gray-900">
                  <div className="absolute left-6 top-8 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900">
                    <feature.icon className="h-6 w-6 text-white" aria-hidden="true" />
                  </div>
                  {feature.name}
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-600">{feature.description}</dd>
                <dd className="mt-4 space-y-2 text-sm leading-6 text-gray-600">
                  {feature.bestFor && (
                    <p><span className="font-semibold text-gray-800">Best for:</span> {feature.bestFor}</p>
                  )}
                  {feature.primarySignal && (
                    <p><span className="font-semibold text-gray-800">Primary signal:</span> {feature.primarySignal}</p>
                  )}
                  {feature.businessOutcome && (
                    <p><span className="font-semibold text-gray-800">Business outcome:</span> {feature.businessOutcome}</p>
                  )}
                </dd>
                <dd className="mt-6">
                  <Link href={`/features/${feature.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
                    Learn more <span aria-hidden="true">→</span>
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mx-auto mt-16 max-w-3xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white sm:mt-20">
          <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to automate from real-time engagement signals?
          </h3>
          <p className="mt-4 text-base text-gray-200">
            Start with the live demo and see how document events can trigger immediate team actions.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link
              href="/demo"
              className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              View live demo
            </Link>
            <Link href="/solutions" className="text-sm font-semibold text-white hover:text-gray-200">
              Browse use cases <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featureListJsonLd) }}
      />
    </div>
  );
}
