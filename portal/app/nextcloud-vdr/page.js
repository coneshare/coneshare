import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: 'Nextcloud VDR: Build a Secure Data Room on Nextcloud | Coneshare',
  description:
    'Learn how to create a Nextcloud VDR workflow with secure sharing, document tracking, and workflow actions.',
  keywords: [
    'nextcloud vdr',
    'nextcloud data room',
    'nextcloud virtual data room',
    'nextcloud document tracking',
    'self hosted vdr',
  ],
  alternates: {
    canonical: '/nextcloud-vdr',
  },
};

export default function NextcloudVdrPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Does Nextcloud have a built-in VDR?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Nextcloud can support core data room structure through folders and permissions, but many teams add a workflow layer for deeper sharing controls, engagement visibility, and operational follow-up.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I create a data room in Nextcloud?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Start by organizing documents in Nextcloud and setting baseline permissions. Then add a sharing and tracking layer, such as Coneshare, to apply secure controls, monitor engagement, and drive follow-up workflows.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is Nextcloud secure for VDR use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Nextcloud is widely used for secure self-hosted storage. For advanced VDR workflows, teams typically add capabilities such as viewer tracking, external sharing controls, and automation.',
        },
      },
      {
        '@type': 'Question',
        name: 'How can I add document tracking to Nextcloud?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'You can add a control and intelligence layer like Coneshare to track views, revisits, and engagement behavior for selected external sharing workflows.',
        },
      },
    ],
  };

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Nextcloud VDR</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Build a secure VDR on Nextcloud with full control and visibility
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Keep your Nextcloud workflow and add virtual data room capabilities for secure sharing, document tracking,
            and workflow actions.
          </p>
          <p className="mt-3 text-base text-gray-600">Know who viewed what, when they engaged, and what to do next.</p>
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
            <h2 className="text-gray-900">What is a Nextcloud VDR?</h2>
            <p>
              A Nextcloud VDR (virtual data room) is a secure environment for sharing sensitive documents in workflows such as
              fundraising, M&amp;A diligence, legal exchange, and enterprise collaboration.
            </p>
            <p>
              Nextcloud provides a strong self-hosted storage foundation, but many teams add sharing intelligence and workflow
              capabilities to support high-stakes external distribution.
            </p>
          </div>
        </div>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Limitations of using Nextcloud alone as a data room</h2>
            <ul>
              <li>Limited visibility into external viewer behavior</li>
              <li>No built-in engagement workflow for follow-up timing</li>
              <li>Link sharing does not provide decision-ready context</li>
              <li>Advanced distribution controls can require additional tooling</li>
            </ul>
            <p><strong>Nextcloud handles storage well, but controlled distribution needs another layer.</strong></p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Add a VDR layer to Nextcloud</h2>
            <p>
              Coneshare adds secure sharing controls, engagement visibility, and workflow actions to selected
              Nextcloud-based external sharing workflows.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">How to build a Nextcloud VDR</h2>
          <ol className="mt-6 space-y-6 text-base leading-7 text-gray-700">
            <li>
              <strong>1. Store files in Nextcloud</strong>
              <p className="mt-1">Organize and maintain documents in your existing Nextcloud workspace.</p>
            </li>
            <li>
              <strong>2. Connect Nextcloud to Coneshare</strong>
              <p className="mt-1">Import selected files into controlled sharing workflows.</p>
              <div className="mt-4">
                <Image
                  src="/screenshots/feat-cloud-import.png"
                  alt="Nextcloud and cloud storage connection flow for importing files into Coneshare"
                  width={1200}
                  height={750}
                  className="rounded-xl border border-gray-200 shadow-sm"
                />
                <p className="mt-2 text-sm text-gray-500">Connect existing storage workflows and import selected files for controlled external sharing.</p>
              </div>
            </li>
            <li>
              <strong>3. Apply VDR controls</strong>
              <p className="mt-1">Set passwords, expirations, email verification, download restrictions, and watermarking.</p>
              <div className="mt-4">
                <Image
                  src="/screenshots/feat-sharing.png"
                  alt="Secure link controls for password protection, expiration, and verification settings"
                  width={1200}
                  height={750}
                  className="rounded-xl border border-gray-200 shadow-sm"
                />
                <p className="mt-2 text-sm text-gray-500">Apply distribution controls before sharing sensitive files externally.</p>
              </div>
            </li>
            <li>
              <strong>4. Share securely</strong>
              <p className="mt-1">Generate controlled links for investors, buyers, legal counterparts, or clients.</p>
            </li>
            <li>
              <strong>5. Track engagement</strong>
              <p className="mt-1">Monitor views, revisits, timing, and page-level attention patterns.</p>
              <div className="mt-4">
                <Image
                  src="/screenshots/feat-analytics.png"
                  alt="Document engagement analytics with viewer activity and page-level behavior insights"
                  width={1200}
                  height={750}
                  className="rounded-xl border border-gray-200 shadow-sm"
                />
                <p className="mt-2 text-sm text-gray-500">Use engagement visibility to prioritize follow-ups with better timing.</p>
              </div>
            </li>
            <li>
              <strong>6. Act on insights</strong>
              <p className="mt-1">Trigger Slack/webhook workflows and follow up with better timing.</p>
            </li>
          </ol>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Nextcloud alone vs Nextcloud + Coneshare</h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-900">Capability</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">Nextcloud alone</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">Nextcloud + Coneshare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-4 py-3 text-gray-700">Storage and collaboration</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Secure external distribution controls</td>
                  <td className="px-4 py-3 text-gray-700">Limited</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Engagement visibility</td>
                  <td className="px-4 py-3 text-gray-700">Limited</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Workflow automation</td>
                  <td className="px-4 py-3 text-gray-700">No</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Use cases</h2>
            <h3>Secure external sharing</h3>
            <p>
              Share sensitive documents with stronger access controls and clearer visibility into external engagement behavior.
              See <Link href="/solutions/secure-external-sharing">secure external sharing workflow</Link>.
            </p>
            <h3>Fundraising data room</h3>
            <p>Share investor materials securely and track revisit behavior to prioritize follow-up timing.</p>
            <h3>M&amp;A and due diligence</h3>
            <p>Organize sensitive documents, apply controlled sharing, and monitor engagement signals.</p>
            <h3>Legal document exchange</h3>
            <p>Distribute confidential files with strict controls and visibility into access behavior.</p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Why teams choose Coneshare for Nextcloud VDR workflows</h2>
            <ul>
              <li>Works with existing Nextcloud-based storage workflows</li>
              <li>Self-hosted architecture and infrastructure control</li>
              <li>Purpose-built for high-stakes sharing workflows</li>
              <li>Document intelligence layer beyond storage</li>
            </ul>
            <p>
              Also evaluating DocSend alternatives? See <Link href="/alternatives/docsend">Coneshare vs DocSend</Link>.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">FAQ</h2>
            <h3>Does Nextcloud have a built-in VDR?</h3>
            <p>
              Nextcloud can support core data room structure through folders and permissions, but many teams add a workflow
              layer for deeper sharing controls, engagement visibility, and operational follow-up.
            </p>
            <h3>How do I create a data room in Nextcloud?</h3>
            <p>
              Start by organizing documents and permissions in Nextcloud, then add controlled sharing and tracking workflows.
            </p>
            <h3>Is Nextcloud secure for VDR use?</h3>
            <p>
              Nextcloud is widely used for secure self-hosted storage. Advanced VDR workflows usually require additional sharing
              intelligence and automation.
            </p>
            <h3>How can I add document tracking to Nextcloud?</h3>
            <p>
              Add a control and intelligence layer like Coneshare to monitor views, revisits, and engagement behavior.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Turn Nextcloud into a complete virtual data room</h2>
          <p className="mt-4 text-base text-gray-200">
            Keep your Nextcloud workflow and add secure sharing, visibility, and workflow actions.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View live demo
            </Link>
            <Link href="/integrations/nextcloud" className="text-sm font-semibold text-white hover:text-gray-200">
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
