import Link from 'next/link';
import { features } from '../../lib/content';

const SITE_URL = 'https://www.coneshare.com';

export const metadata = {
  title: 'Features | Coneshare',
  description: 'Explore Coneshare features that add secure control, engagement intelligence, and workflow actions to existing document workflows.',
  keywords: [
    'document control and intelligence layer',
    'nextcloud vdr layer',
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

const layerGroups = [
  {
    title: 'Control Layer',
    description: 'Add controlled sharing for sensitive external distribution.',
    slugs: ['secure-sharing', 'dynamic-watermarking', 'file-requests'],
  },
  {
    title: 'Intelligence Layer',
    description: 'Understand document and data room engagement with measurable usage signals.',
    slugs: ['advanced-analytics', 'virtual-data-rooms'],
  },
  {
    title: 'Action Layer',
    description: 'Turn engagement signals into team workflows and timely follow-ups.',
    slugs: ['workflow-automation-integration'],
  },
  {
    title: 'Foundation Layer',
    description: 'Connect your storage stack and run Coneshare in your preferred infrastructure model.',
    slugs: ['cloud-storage-integration', 'self-hosted'],
  },
];

function renderFeatureCard(feature) {
  return (
    <div key={feature.slug} className="relative rounded-lg border border-gray-200 bg-white p-8 pl-20 shadow-sm">
      <dt className="text-base font-semibold leading-7 text-gray-900">
        <div className="absolute left-6 top-8 flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
          <feature.icon className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        {feature.name}
      </dt>
      <dd className="mt-2 text-base leading-7 text-gray-600">{feature.description}</dd>
      <dd className="mt-6">
        <Link href={`/features/${feature.slug}`} className="text-sm font-semibold leading-6 text-gray-900 hover:text-gray-700">
          Learn more <span aria-hidden="true">→</span>
        </Link>
      </dd>
    </div>
  );
}

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
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-base font-semibold leading-7 text-gray-900">Core Features</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            A control and intelligence layer for your documents
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare works with Nextcloud, Google Drive, and Dropbox workflows. Keep your storage workflow and add
            control, visibility, and workflow actions for external distribution.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm font-semibold">
            <Link href="/integrations/nextcloud" className="text-gray-900 hover:text-gray-700">Nextcloud integration</Link>
            <Link href="/integrations/google-drive" className="text-gray-900 hover:text-gray-700">Google Drive integration</Link>
            <Link href="/integrations/dropbox" className="text-gray-900 hover:text-gray-700">Dropbox integration</Link>
          </div>
        </div>

        {layerGroups.map((group) => {
          const groupFeatures = group.slugs
            .map((slug) => features.find((feature) => feature.slug === slug))
            .filter(Boolean);

          return (
            <section key={group.title} className="mx-auto mt-16 max-w-6xl first:mt-14">
              <div className="max-w-3xl">
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">{group.title}</h3>
                <p className="mt-3 text-base leading-7 text-gray-600">{group.description}</p>
              </div>
              <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2 lg:gap-y-16">
                {groupFeatures.map((feature) => renderFeatureCard(feature))}
              </dl>
            </section>
          );
        })}

        <div className="mx-auto mt-16 max-w-3xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white sm:mt-20">
          <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to apply these capabilities to real workflows?
          </h3>
          <p className="mt-4 text-base text-gray-200">
            See how control, intelligence, and action layers work together across fundraising, sales, and deal execution.
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
