import Link from 'next/link';

export const metadata = {
  title: 'Google Drive Integration: Secure Sharing and Tracking | Coneshare',
  description:
    'Enhance Google Drive workflows with secure sharing, document tracking, and workflow automation.',
  keywords: [
    'google drive integration',
    'google drive secure sharing',
    'google drive document tracking',
    'google drive workflow automation',
  ],
  alternates: {
    canonical: '/integrations/google-drive',
  },
};

export default function GoogleDriveIntegrationPage() {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Google Drive Integration</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Keep your Google Drive workflow. Add control and visibility when sharing matters.
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare adds a secure distribution and tracking layer for selected Google Drive files so you can understand
            what happens after sharing a document.
          </p>
          <div className="mt-10 flex items-center justify-center gap-5">
            <Link href="/demo" className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">
              View live demo
            </Link>
            <Link href="/integrations/nextcloud" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
              Compare with Nextcloud setup <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Where Google Drive works, and where it does not</h2>
            <h3>What Google Drive is great at</h3>
            <ul>
              <li>Collaboration and file sharing</li>
              <li>Easy access across teams</li>
              <li>Fast internal workflows</li>
            </ul>
            <h3>Where it breaks down for external sharing</h3>
            <ul>
              <li>Links can be forwarded without strong distribution controls</li>
              <li>Limited visibility into who actually reads documents</li>
              <li>No direct workflow signals after sharing</li>
            </ul>
            <p><strong>Google Drive helps teams send documents, but not understand what happens next.</strong></p>
          </div>
        </div>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">How this integration works</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
            <li>Google Drive remains part of your document workflow</li>
            <li>Coneshare imports selected files for external sharing and tracking</li>
            <li>No full storage migration required</li>
          </ul>
          <p className="mt-6 text-base leading-7 text-gray-700">Coneshare handles secure links, access control, engagement tracking, and workflow triggers.</p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Capability layers</h2>
          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Control layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">Password protection, expiration dates, verification, and download restrictions.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Intelligence layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">Viewer activity timing, revisit behavior, and page-level engagement context.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Action layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">Real-time notifications, Slack alerts, and webhook triggers for follow-up workflows.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Workflow</h2>
          <ol className="mt-6 space-y-5 text-base leading-7 text-gray-700">
            <li><strong>1. Connect Google Drive</strong>: link your existing document workflow.</li>
            <li><strong>2. Apply sharing controls</strong>: configure secure access rules.</li>
            <li><strong>3. Share documents</strong>: generate trackable links.</li>
            <li><strong>4. Track and respond</strong>: monitor engagement and follow up.</li>
          </ol>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">When to use this integration</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
            <li>You already use Google Drive</li>
            <li>You share documents externally with investors, clients, or partners</li>
            <li>You need visibility into document engagement</li>
            <li>You want to improve follow-up timing</li>
          </ul>
          <p className="mt-6 text-base leading-7 text-gray-700"><strong>Not ideal if:</strong> you only collaborate internally and basic link sharing is enough.</p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Google Drive alone vs with Coneshare</h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-900">Capability</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">Google Drive</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">With Coneshare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr><td className="px-4 py-3 text-gray-700">Storage and collaboration</td><td className="px-4 py-3 text-gray-700">Yes</td><td className="px-4 py-3 text-gray-700">Yes</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">External sharing control</td><td className="px-4 py-3 text-gray-700">Basic</td><td className="px-4 py-3 text-gray-700">Advanced</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">Viewer visibility</td><td className="px-4 py-3 text-gray-700">Limited</td><td className="px-4 py-3 text-gray-700">Enhanced</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">Engagement tracking</td><td className="px-4 py-3 text-gray-700">Limited</td><td className="px-4 py-3 text-gray-700">Detailed</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">Workflow signals</td><td className="px-4 py-3 text-gray-700">Limited</td><td className="px-4 py-3 text-gray-700">Yes</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Related setups</h2>
            <ul>
              <li><Link href="https://docs.coneshare.com/en/google-drive-integration-guide/" target="_blank" rel="noopener noreferrer">Google Drive integration guide</Link></li>
              <li>Need full infrastructure control? <Link href="/integrations/nextcloud">See Nextcloud integration</Link></li>
              <li>Using Dropbox too? <Link href="/integrations/dropbox">Compare Dropbox integration</Link></li>
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">When sharing becomes high-stakes, upgrade your workflow</h2>
          <p className="mt-4 text-base text-gray-200">Keep your Google Drive workflow. Add control, visibility, and action.</p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View live demo
            </Link>
            <Link href="/integrations/nextcloud" className="text-sm font-semibold text-white hover:text-gray-200">
              Compare with Nextcloud setup <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
