import { solutions, features } from '../../../lib/content';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const solution = solutions.find((s) => s.slug === slug);

  if (!solution) {
    return {
      title: 'Use Case Not Found | Coneshare',
      description: 'Explore Coneshare use cases for real-time engagement visibility and workflow automation.',
    };
  }

  return {
    title: `${solution.name} | Self-Hosted Use Case | Coneshare`,
    description: `${solution.description} Self-hosted workflow for document and dataroom activity automation.`,
    keywords: solution.keywords || [],
    alternates: {
      canonical: `/solutions/${solution.slug}`,
    },
    openGraph: {
      title: `${solution.name} | Coneshare Use Cases`,
      description: `${solution.description} Built for self-hosted document and dataroom workflows.`,
      url: `https://www.coneshare.com/solutions/${solution.slug}`,
      type: 'article',
    },
  };
}

export default async function SolutionDetailPage({ params }) {
  const { slug } = await params;

  const solution = solutions.find((s) => s.slug === slug);
  const relatedFeatures = features.filter((feature) => (feature.relatedSolutionSlugs || []).includes(slug));

  if (!solution) {
    notFound();
  }

  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-x-4">
             <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900">
                <solution.icon className="h-7 w-7 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {solution.name}
            </h1>
          </div>
          <p className="mt-6 text-xl leading-8 text-gray-700">
            {solution.description}
          </p>

          {solution.storyTags && solution.storyTags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {solution.storyTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {solution.resultHighlights && solution.resultHighlights.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {solution.resultHighlights.map((item) => (
                <div key={`${item.value}-${item.label}`} className="rounded-lg border border-gray-200 bg-white px-5 py-5">
                  <p className="text-2xl font-bold tracking-tight text-gray-900">{item.value}</p>
                  <p className="mt-2 text-sm text-gray-600">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {solution.proof && (
            <div className="mt-10">
              <Image
                src={solution.proof.src}
                alt={solution.proof.alt}
                width={1200}
                height={750}
                className="rounded-xl border shadow-sm"
              />
              {solution.proof.caption && (
                <p className="mt-3 text-sm text-gray-500">{solution.proof.caption}</p>
              )}
            </div>
          )}

          {solution.storySections && solution.storySections.length > 0 && (
            <div className="mt-12 space-y-12">
              {solution.storySections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900">{section.title}</h2>
                  <p className="mt-4 text-base leading-8 text-gray-700">{section.body}</p>
                </section>
              ))}
            </div>
          )}

          {solution.selfHostedWhy && (
            <section className="mt-12">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Why teams choose self-hosted for this workflow</h2>
              <p className="mt-4 text-base leading-8 text-gray-700">{solution.selfHostedWhy}</p>
            </section>
          )}

          <div className="mt-14 rounded-2xl border border-gray-200 bg-gray-50 px-8 py-10">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Ready to get started with Coneshare?
            </h2>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/demo"
                className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                View live demo
              </Link>
              <Link
                href={solution.docsUrl || 'https://docs.coneshare.com/en/'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-gray-900 hover:text-gray-700"
              >
                Read docs <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {relatedFeatures.length > 0 && (
            <div className="mt-10 rounded-2xl border border-gray-200 bg-white px-8 py-8">
              <h2 className="text-xl font-bold tracking-tight text-gray-900">Related Features</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {relatedFeatures.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/features/${item.slug}`}
                    className="rounded-lg border border-gray-200 px-4 py-4 hover:border-gray-300"
                  >
                    <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Optional: Generate static paths at build time
export async function generateStaticParams() {
  return solutions.map((solution) => ({
    slug: solution.slug,
  }));
}
