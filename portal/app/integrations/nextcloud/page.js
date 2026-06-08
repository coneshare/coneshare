import Link from 'next/link';

export const metadata = {
  title: 'Nextcloud Integration: Secure Document Sharing and Tracking Layer | Coneshare',
  description:
    'Connect Nextcloud to Coneshare to add secure sharing, document tracking, and workflow automation to external document workflows.',
  keywords: [
    'nextcloud integration',
    'nextcloud secure sharing integration',
    'nextcloud document tracking integration',
    'nextcloud workflow automation integration',
  ],
  alternates: {
    canonical: '/integrations/nextcloud',
  },
};

export default function NextcloudIntegrationPage() {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Nextcloud Integration</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Connect Nextcloud to add secure sharing, tracking, and workflows
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare works with your existing Nextcloud workflow, adding controlled distribution and visibility
            for selected external sharing workflows.
          </p>
          <div className="mt-10 flex items-center justify-center gap-5">
            <Link href="/demo" className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">
              View live demo
            </Link>
            <Link href="/nextcloud-vdr" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
              See full data room use case <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">What this integration does</h2>
            <p>
              Nextcloud already provides strong storage and access control. This integration adds the missing layer for external sharing:
              controlled distribution, engagement visibility, and event-driven workflows.
            </p>
            <p><strong>Instead of replacing Nextcloud, Coneshare adds controlled external sharing workflows around it.</strong></p>
          </div>
        </div>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">How it fits your architecture</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
            <li>Nextcloud remains part of your document workflow</li>
            <li>Coneshare imports selected files for controlled external sharing</li>
            <li>No full storage migration required</li>
            <li>Existing collaboration workflows remain unchanged</li>
          </ul>
          <p className="mt-6 text-base leading-7 text-gray-700">Coneshare handles secure link generation, access control enforcement, engagement tracking, and workflow triggers.</p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Capability layers</h2>
          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Control layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">
                Restrict external access with password protection, expiry, verification, download controls, and watermarking.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Intelligence layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">
                See who viewed shared content, when activity happened, revisit patterns, and page-level engagement context.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Action layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">
                Trigger Slack or webhook workflows when viewers re-open or meaningfully engage with documents.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Integration workflow</h2>
          <ol className="mt-6 space-y-5 text-base leading-7 text-gray-700">
            <li><strong>1. Connect Nextcloud</strong> (OAuth/API connection)</li>
            <li><strong>2. Apply sharing controls</strong> (link security settings)</li>
            <li><strong>3. Share externally</strong> (secure, trackable links)</li>
            <li><strong>4. Monitor usage</strong> (engagement dashboard and activity timelines)</li>
            <li><strong>5. Trigger actions</strong> (Slack/webhook automation)</li>
          </ol>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">When should you use this integration?</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
            <li>You already use Nextcloud for storage</li>
            <li>You share documents externally with clients, investors, or partners</li>
            <li>You need more control than basic link sharing</li>
            <li>You want visibility into how documents are accessed</li>
          </ul>
          <p className="mt-6 text-base leading-7 text-gray-700">
            <strong>Not ideal if:</strong> you only share files internally and do not need engagement tracking or workflow signals.
          </p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Native Nextcloud vs with Coneshare layer</h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-900">Capability</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">Native Nextcloud</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">With Coneshare layer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-4 py-3 text-gray-700">Self-hosted storage</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                  <td className="px-4 py-3 text-gray-700">Yes</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">External sharing control granularity</td>
                  <td className="px-4 py-3 text-gray-700">Limited</td>
                  <td className="px-4 py-3 text-gray-700">Advanced</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Viewer context visibility</td>
                  <td className="px-4 py-3 text-gray-700">Limited</td>
                  <td className="px-4 py-3 text-gray-700">Enhanced</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Engagement tracking depth</td>
                  <td className="px-4 py-3 text-gray-700">Limited</td>
                  <td className="px-4 py-3 text-gray-700">Detailed activity-level signals</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">Event-driven workflows</td>
                  <td className="px-4 py-3 text-gray-700">No</td>
                  <td className="px-4 py-3 text-gray-700">Yes (Slack/webhooks)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Related setups</h2>
            <ul>
              <li><Link href="https://docs.coneshare.com/en/nextcloud-integration-guide/" target="_blank" rel="noopener noreferrer">Nextcloud integration guide</Link></li>
              <li><Link href="/integrations/google-drive">Compare with Google Drive integration</Link></li>
              <li><Link href="/integrations/dropbox">Compare with Dropbox integration</Link></li>
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Add secure sharing and visibility to Nextcloud</h2>
          <p className="mt-4 text-base text-gray-200">Keep your Nextcloud workflow and add control, tracking, and workflow actions.</p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View live demo
            </Link>
            <Link href="/nextcloud-vdr" className="text-sm font-semibold text-white hover:text-gray-200">
              Explore VDR setup <span aria-hidden="true">→</span>
            </Link>
            <Link href="/integrations/google-drive" className="text-sm font-semibold text-white hover:text-gray-200">
              Compare with Google Drive <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
