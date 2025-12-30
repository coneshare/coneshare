import { features } from '../../../lib/content';
import { notFound } from "next/navigation";

export default async function FeatureDetailPage({ params }) {
  const { slug } = await params;

  const feature = features.find((f) => f.slug === slug);

  if (!feature) {
    notFound();
  }

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

          <div className="mt-10 prose prose-lg text-gray-600">
            {feature.content}
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
