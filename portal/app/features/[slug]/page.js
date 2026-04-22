import { features, solutions } from '../../../lib/content';
import { notFound } from "next/navigation";
import Link from 'next/link';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const feature = features.find((f) => f.slug === slug);

  if (!feature) {
    return {
      title: 'Feature Not Found | Coneshare',
      description: 'Explore Coneshare features for real-time document tracking and workflow automation.',
    };
  }

  return {
    title: `${feature.name} | Coneshare`,
    description: feature.description,
    keywords: [
      `${feature.menuName || feature.name} feature`,
      'self-hosted document sharing',
      'document workflow automation',
      'secure dataroom collaboration',
    ],
    alternates: {
      canonical: `/features/${feature.slug}`,
    },
    openGraph: {
      title: `${feature.name} | Coneshare`,
      description: feature.description,
      url: `https://www.coneshare.com/features/${feature.slug}`,
      type: 'article',
    },
  };
}

export default async function FeatureDetailPage({ params }) {
  const { slug } = await params;

  const feature = features.find((f) => f.slug === slug);

  if (!feature) {
    notFound();
  }

  const relatedUseCases = solutions.filter((solution) =>
    (feature.relatedSolutionSlugs || []).includes(solution.slug)
  );

  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-x-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900">
              <feature.icon
                className="h-7 w-7 text-white"
                aria-hidden="true"
              />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {feature.name}
            </h1>
          </div>

          <p className="mt-6 text-xl leading-8 text-gray-700">
            {feature.description}
          </p>

          {(feature.bestFor || feature.primarySignal || feature.businessOutcome) && (
            <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
              <h2 className="text-lg font-bold tracking-tight text-gray-900">Feature Fit</h2>
              <dl className="mt-4 space-y-3 text-sm leading-6 text-gray-700">
                {feature.bestFor && (
                  <div>
                    <dt className="font-semibold text-gray-800">Best for</dt>
                    <dd>{feature.bestFor}</dd>
                  </div>
                )}
                {feature.primarySignal && (
                  <div>
                    <dt className="font-semibold text-gray-800">Primary signal</dt>
                    <dd>{feature.primarySignal}</dd>
                  </div>
                )}
                {feature.businessOutcome && (
                  <div>
                    <dt className="font-semibold text-gray-800">Business outcome</dt>
                    <dd>{feature.businessOutcome}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          <div className="mt-10 prose prose-lg text-gray-600">
            {feature.content}
          </div>

          {feature.workflowSteps && (
            <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-8">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Typical Workflow</h2>
              <ol className="mt-6 list-decimal space-y-3 pl-5 text-base leading-7 text-gray-700">
                {feature.workflowSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {relatedUseCases.length > 0 && (
            <div className="mt-10 rounded-2xl border border-gray-200 bg-white px-8 py-8">
              <h2 className="text-xl font-bold tracking-tight text-gray-900">Related Use Cases</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {relatedUseCases.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/solutions/${item.slug}`}
                    className="rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300"
                  >
                    <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-14 rounded-2xl bg-gray-900 px-8 py-10 text-white">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Next Step
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              See this feature live in Coneshare
            </h2>
            <p className="mt-4 text-base text-gray-200">
              Explore the demo environment and see how real-time activity and automation work together in practice.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/demo"
                className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
              >
                View live demo
              </Link>
              <Link
                href="https://docs.coneshare.com/en/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white hover:text-gray-200"
              >
                Read docs <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/solutions"
                className="text-sm font-semibold text-white hover:text-gray-200"
              >
                See matching use cases <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Optional: Generate static paths at build time
export async function generateStaticParams() {
  return features.map((feature) => ({
    slug: feature.slug,
  }));
}
