import { solutions } from '../../../lib/content';
import { notFound } from 'next/navigation';

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
