import Link from 'next/link';

export const metadata = {
  title: 'About Coneshare | Why We Build Self-Hosted Document Sharing',
  description:
    'Learn why Coneshare exists, what problem it is built to solve, and how the product is designed for secure document sharing workflows.',
  alternates: {
    canonical: '/about',
  },
};

const principles = [
  {
    title: 'Keep storage ownership clear',
    body:
      'Many teams already have a storage system they trust. Coneshare is designed to add a control and intelligence layer without forcing a storage migration.',
  },
  {
    title: 'Build in the open',
    body:
      'Coneshare is open-source so teams can inspect the code, understand the architecture, and adapt deployment to their own security and infrastructure requirements.',
  },
  {
    title: 'Expose the workflow through APIs',
    body:
      'Coneshare exposes document sharing, activity, and automation workflows through APIs so teams can integrate with internal systems, security processes, and existing enterprise tooling.',
  },
];

const signupUrl = 'https://app.coneshare.com/signup';

export default function AboutPage() {
  return (
    <div className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">About Coneshare</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Built for teams that need document control without giving up infrastructure control
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare exists because sensitive document workflows often sit between two inadequate options:
            plain storage links with limited context, or hosted data room tools that require teams to move
            documents into another vendor-controlled system.
          </p>
        </div>

        <section className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">The problem we care about</h2>
            <p>
              Fundraising, diligence, legal exchange, procurement, and enterprise sales all depend on
              controlled external sharing. The moment a document leaves an internal workspace, teams need to
              know who can access it, whether it was viewed, what changed, and which follow-up should happen next.
            </p>
            <p>
              Existing cloud storage is a strong foundation for ownership and collaboration, but it usually
              stops short of the distribution workflow. Coneshare is built to fill that gap with secure links,
              data rooms, watermarking, engagement visibility, file requests, and event-driven automation.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-4xl border-t border-gray-200 pt-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">How We Build</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">What we optimize for</h2>
            </div>
            <div className="divide-y divide-gray-200 lg:col-span-8">
              {principles.map((principle, index) => (
                <div key={principle.title} className="grid gap-4 py-6 first:pt-0 sm:grid-cols-12">
                  <p className="text-sm font-semibold text-gray-400 sm:col-span-2">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <div className="sm:col-span-10">
                    <h3 className="text-base font-semibold text-gray-900">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{principle.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-4xl">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Where It Fits</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">Useful when sharing needs more than a link</h2>
            </div>
            <div className="space-y-8 lg:col-span-8">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Coneshare is a good fit for</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
                  <li>Teams using Nextcloud, Google Drive, or Dropbox as their source of truth.</li>
                  <li>Organizations that need VDR-style controls without moving files into a new storage system.</li>
                  <li>Fundraising, diligence, legal, procurement, and sales workflows where viewer context matters.</li>
                  <li>Security-conscious teams that want self-hosted deployment and infrastructure ownership.</li>
                </ul>
              </div>
              <div className="border-t border-gray-200 pt-8">
                <h3 className="text-base font-semibold text-gray-900">Coneshare is probably not the right tool for</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
                  <li>Casual file sharing where a plain cloud link is enough.</li>
                  <li>Teams looking for a full storage replacement instead of a sharing and workflow layer.</li>
                  <li>Workflows that do not need access controls, tracking, watermarking, or audit context.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-4xl rounded-lg bg-gray-900 px-6 py-8 text-white sm:px-8">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <h2 className="text-2xl font-bold tracking-tight">See the product before you commit</h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                The demo environment is public and resets periodically. It is meant to make the core workflow
                visible before you contact sales or evaluate self-hosted deployment.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
              <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Live Demo
              </Link>
              <Link href={signupUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Get Started
              </Link>
              <Link href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                GitHub
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl text-sm leading-6 text-gray-600">
          <p>
            For sales, procurement, or security review questions, contact{' '}
            <a href="mailto:sales@coneshare.com" className="font-semibold text-gray-900 hover:text-gray-700">
              sales@coneshare.com
            </a>
            . For support and security reports, contact{' '}
            <a href="mailto:dev@coneshare.com" className="font-semibold text-gray-900 hover:text-gray-700">
              dev@coneshare.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
