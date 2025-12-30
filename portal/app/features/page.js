import Link from 'next/link';
import { features } from '../../lib/content';

export default function FeaturesPage() {
  return (
    <div className="bg-white py-24 sm:py-32">
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
              <div key={feature.slug} className="relative pl-16">
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
  );
}
