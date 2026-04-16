import Link from 'next/link';
import { solutions } from '../../lib/content';

export const metadata = {
  title: 'Use Cases | Coneshare',
  description: 'See how founders and revenue teams use Coneshare for investor awareness, engagement visibility, and timely follow-ups.',
  alternates: {
    canonical: '/solutions',
  },
};

export default function SolutionsPage() {
  return (
    <div className="bg-gray-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-gray-900">Use Cases</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Workflows built for deal momentum
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Designed for founders and revenue teams that need immediate engagement visibility and fast, coordinated follow-ups.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-5xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {solutions.map((solution) => (
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
              ))}
            </dl>
          </div>
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
                See automation in action
              </Link>
              <Link href="/features" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
                Explore features <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
  );
}
