import Link from 'next/link';

const SITE_URL = 'https://www.coneshare.com';

export const metadata = {
  title: 'DocSend Alternative: Self-Hosted Secure Sharing | Coneshare',
  description:
    'Looking for a DocSend alternative? Coneshare provides secure sharing, document tracking, and data room workflows on your own infrastructure.',
  keywords: [
    'docsend alternative',
    'open source docsend alternative',
    'self hosted document sharing',
    'secure document sharing with tracking',
  ],
  alternates: {
    canonical: '/alternatives/docsend',
  },
};

export default function DocsendAlternativePage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is a good alternative to DocSend?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'A good DocSend alternative depends on your operating model. Coneshare is designed for teams that need secure sharing and tracking while keeping deployment and data control in their own environment.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is there an open-source alternative to DocSend?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Yes. Coneshare is open-source and supports secure document sharing, engagement visibility, and data room workflows.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use existing storage with a DocSend alternative?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'With Coneshare, you can keep your existing storage model and add sharing controls and tracking workflows on top.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is Coneshare self-hosted?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Coneshare is designed for self-hosted deployment so teams can run document sharing workflows within their own infrastructure boundary.',
        },
      },
    ],
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">DocSend Alternative</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            A DocSend alternative for secure, trackable document sharing
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare adds secure sharing, document tracking, and data room workflows on top of your existing storage without
            requiring a separate SaaS document repository.
          </p>
          <p className="mt-3 text-base text-gray-600">Works with Google Drive, Dropbox, and Nextcloud.</p>
          <div className="mt-10 flex items-center justify-center gap-5">
            <Link href="/demo" className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">
              View live demo
            </Link>
            <Link href="/integrations/nextcloud" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
              See Nextcloud integration <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Why teams look for a DocSend alternative</h2>
            <p>Many teams start with DocSend for document tracking. Over time, common constraints emerge.</p>
            <ul>
              <li>Documents are uploaded into a separate SaaS delivery flow</li>
              <li>Sensitive file distribution may fall outside preferred infrastructure boundaries</li>
              <li>Workflow flexibility for internal systems can be limited</li>
              <li>Deeper integration expectations grow as use cases mature</li>
            </ul>
          </div>
        </div>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">What makes a strong DocSend alternative?</h2>
            <p>Teams usually evaluate alternatives across five areas:</p>
            <ul>
              <li>Secure link-based sharing with granular controls</li>
              <li>Document tracking and engagement visibility</li>
              <li>Virtual data room organization and access workflows</li>
              <li>Compatibility with existing storage systems</li>
              <li>Deployment and data control options</li>
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Coneshare takes a different approach</h2>
            <p>
              You do not need to replace storage. You need to control distribution and understand engagement after sharing.
              Coneshare operates as a control and intelligence layer above existing storage.
            </p>
            <p>
              If you are Nextcloud-first, start with the <Link href="/nextcloud-vdr">Nextcloud VDR page</Link>. You can also review
              the <Link href="/integrations/nextcloud">Nextcloud integration details</Link>.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Feature layers</h2>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Secure sharing</h3>
              <ul className="mt-3 space-y-2 text-base leading-7 text-gray-700">
                <li>Password protection</li>
                <li>Expiration dates</li>
                <li>Email verification</li>
                <li>Download restrictions</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Document tracking</h3>
              <ul className="mt-3 space-y-2 text-base leading-7 text-gray-700">
                <li>Viewer activity timelines</li>
                <li>Return-visit patterns</li>
                <li>Page-level engagement context</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Workflow actions</h3>
              <ul className="mt-3 space-y-2 text-base leading-7 text-gray-700">
                <li>Real-time notifications</li>
                <li>Slack and webhook routing</li>
                <li>Event-driven follow-up workflows</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Coneshare vs DocSend</h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-900">Dimension</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">DocSend</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">Coneshare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-4 py-3 text-gray-700">Data ownership posture</td>
                  <td className="px-4 py-3 text-gray-700">Vendor-managed SaaS delivery model</td>
                  <td className="px-4 py-3 text-gray-700">Self-hosted deployment model with internal infrastructure control</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Storage workflow</td>
                  <td className="px-4 py-3 text-gray-700">Upload into separate SaaS workspace</td>
                  <td className="px-4 py-3 text-gray-700">Layer on top of existing storage workflows</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Flexibility</td>
                  <td className="px-4 py-3 text-gray-700">Product-defined workflow boundaries</td>
                  <td className="px-4 py-3 text-gray-700">Slack, webhooks, and internal stack integration</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Best fit</td>
                  <td className="px-4 py-3 text-gray-700">Convenience-first SaaS teams</td>
                  <td className="px-4 py-3 text-gray-700">Control-first, security-conscious teams</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Who should use Coneshare?</h2>
            <ul>
              <li>Teams that prefer deployment and data control inside their own environment</li>
              <li>Organizations sharing sensitive fundraising, sales, legal, or diligence documents</li>
              <li>Teams that need measurable engagement signals and operational follow-up paths</li>
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">FAQ</h2>
            <h3>What is a good alternative to DocSend?</h3>
            <p>
              A good DocSend alternative depends on your operating model. Coneshare is suited for teams that need secure sharing
              and tracking while keeping deployment and data control in their own environment.
            </p>
            <h3>Is there an open-source alternative to DocSend?</h3>
            <p>
              Yes. Coneshare is open-source and provides secure sharing controls, engagement visibility, and data room workflows.
            </p>
            <h3>Can I use my existing storage with a DocSend alternative?</h3>
            <p>
              With Coneshare, you can keep existing storage workflows and add secure distribution controls and tracking on top.
            </p>
            <h3>Is Coneshare self-hosted?</h3>
            <p>
              Coneshare is designed for self-hosted deployment, allowing teams to operate document sharing within their own
              infrastructure boundary.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl border border-gray-200 bg-gray-50 p-8">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Using Nextcloud?</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">
            Coneshare adds VDR-style sharing, document tracking, and workflow actions on top of Nextcloud.
          </p>
          <p className="mt-6">
            <Link href="/nextcloud-vdr" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
              Explore Nextcloud VDR <span aria-hidden="true">→</span>
            </Link>
          </p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Looking for a DocSend alternative?</h2>
          <p className="mt-4 text-base text-gray-200">Keep your data model. Add control, visibility, and workflows.</p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View live demo
            </Link>
            <Link href="/nextcloud-vdr" className="text-sm font-semibold text-white hover:text-gray-200">
              Get started <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      </div>
    </div>
  );
}
