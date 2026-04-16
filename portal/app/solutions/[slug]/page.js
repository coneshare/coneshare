import { solutions } from '../../../lib/content';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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
    title: `${solution.name} | Coneshare Use Cases`,
    description: solution.description,
    alternates: {
      canonical: `/solutions/${solution.slug}`,
    },
    openGraph: {
      title: `${solution.name} | Coneshare Use Cases`,
      description: solution.description,
      url: `https://www.coneshare.com/solutions/${solution.slug}`,
      type: 'article',
    },
  };
}

export default async function SolutionDetailPage({ params }) {
  const { slug } = await params;

  const solution = solutions.find((s) => s.slug === slug);

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
          <blockquote className="mt-6 border-l-4 border-gray-200 pl-4 italic text-gray-600">
            "{solution.quote}"
          </blockquote>
          <div className="mt-10 prose prose-lg text-gray-600">
            {solution.content}
          </div>

          <div className="mt-14 rounded-2xl border border-gray-200 bg-gray-50 px-8 py-10">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Take Action
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Put this use case into motion
            </h2>
            <p className="mt-4 text-base text-gray-600">
              Launch the demo to see real-time engagement signals, then connect alerts to your team via Slack or webhooks.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/demo"
                className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                See automation in action
              </Link>
              <Link
                href="/features"
                className="text-sm font-semibold text-gray-900 hover:text-gray-700"
              >
                Explore features <span aria-hidden="true">→</span>
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
  return solutions.map((solution) => ({
    slug: solution.slug,
  }));
}
