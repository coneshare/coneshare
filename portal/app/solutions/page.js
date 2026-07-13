import Link from 'next/link';
import { solutions } from '../../lib/content';

const SITE_URL = 'https://www.coneshare.com';

export const metadata = {
  title: 'Use Cases | Coneshare',
  description: 'See how teams use Coneshare as a document control and intelligence layer for fundraising, sales, legal, and diligence workflows.',
  keywords: [
    'document control and intelligence use cases',
    'nextcloud data room workflows',
    'self-hosted document automation use cases',
    'dataroom activity use cases',
    'investor awareness workflow',
    'sales follow-up automation',
    'deal visibility workflow',
  ],
  alternates: {
    canonical: '/solutions',
  },
};

const groups = [
  {
    title: 'Revenue and Fundraising',
    slugs: ['secure-fundraising', 'engagement-visibility', 'timely-follow-ups'],
  },
  {
    title: 'Team Coordination',
    slugs: ['team-awareness'],
  },
  {
    title: 'Deal Execution',
    slugs: ['deal-visibility', 'real-estate-diligence'],
  },
  {
    title: 'Security and Governance',
    slugs: ['secure-external-sharing'],
  },
];

function renderUseCaseCard(solution) {
  return (
    <div key={solution.slug} className="flex flex-col rounded-lg bg-white p-8 shadow">
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
  );
}

export default function SolutionsPage() {
  const useCaseListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Coneshare Use Cases',
    itemListElement: solutions.map((solution, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/solutions/${solution.slug}`,
      name: solution.name,
      description: solution.description,
    })),
  };

  return (
    <div className="bg-gray-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-base font-semibold leading-7 text-gray-900">Use Cases</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            From document sharing to decision signals
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare turns documents stored in Nextcloud, Google Drive, and Dropbox into measurable workflows your team can act on.
          </p>
        </div>

        {groups.map((group) => {
          const items = group.slugs.map((slug) => solutions.find((solution) => solution.slug === slug)).filter(Boolean);

          return (
            <section key={group.title} className="mx-auto mt-16 max-w-6xl first:mt-14">
              <h3 className="text-2xl font-bold tracking-tight text-gray-900">{group.title}</h3>
              <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-3">
                {items.map((solution) => renderUseCaseCard(solution))}
              </dl>
            </section>
          );
        })}

        <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center sm:mt-20">
          <h3 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Want this visibility in your deal process?
          </h3>
          <p className="mt-4 text-base text-gray-600">
            Test the workflow in the live demo and connect real-time events to your internal follow-up motion.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link
              href="/demo"
              className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              View live demo
            </Link>
            <Link href="/features" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
              Explore features <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(useCaseListJsonLd) }}
      />
    </div>
  );
}
