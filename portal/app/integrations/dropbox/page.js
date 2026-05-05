import Link from 'next/link';

export const metadata = {
  title: 'Dropbox Integration: Controlled Sharing and Tracking | Coneshare',
  description:
    'Extend Dropbox with secure sharing, document tracking, and workflow automation. Add visibility and control without changing storage.',
  keywords: [
    'dropbox integration',
    'dropbox secure sharing',
    'dropbox document tracking',
    'dropbox workflow automation',
  ],
  alternates: {
    canonical: '/integrations/dropbox',
  },
};

export default function DropboxIntegrationPage() {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Dropbox Integration</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Use Dropbox for collaboration. Add control when sharing externally.
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Coneshare adds a control and intelligence layer on top of Dropbox, turning shared-document activity into actionable signals.
          </p>
          <div className="mt-10 flex items-center justify-center gap-5">
            <Link href="/demo" className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800">
              View live demo
            </Link>
            <Link href="/alternatives/docsend" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
              Compare with DocSend alternative <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl border-t border-gray-200 pt-12">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Where Dropbox falls short for external sharing</h2>
            <h3>What Dropbox is great at</h3>
            <ul>
              <li>File syncing and collaboration</li>
              <li>Team workflows</li>
              <li>Document organization</li>
            </ul>
            <h3>Where external sharing breaks down</h3>
            <ul>
              <li>External link control can be limited for sensitive sharing</li>
              <li>Limited visibility into who actually views key documents</li>
              <li>No direct workflow signals after sharing</li>
            </ul>
            <p><strong>Dropbox helps teams collaborate, but not manage controlled external distribution.</strong></p>
          </div>
        </div>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">How this integration works</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
            <li>Files remain stored in Dropbox</li>
            <li>Coneshare connects without replacing storage</li>
            <li>No storage migration required</li>
          </ul>
          <p className="mt-6 text-base leading-7 text-gray-700">Coneshare handles controlled sharing, engagement tracking, and workflow automation.</p>
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
              <p className="mt-2 text-base leading-7 text-gray-700">Viewer visibility, access timing, revisit behavior, and page-level engagement context.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Action layer</h3>
              <p className="mt-2 text-base leading-7 text-gray-700">Slack notifications, webhook triggers, and event-driven workflows.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Workflow</h2>
          <ol className="mt-6 space-y-5 text-base leading-7 text-gray-700">
            <li><strong>1. Connect Dropbox</strong>: link your existing files.</li>
            <li><strong>2. Apply controls</strong>: configure secure sharing rules.</li>
            <li><strong>3. Share externally</strong>: generate controlled, trackable links.</li>
            <li><strong>4. Track and act</strong>: monitor engagement and trigger actions.</li>
          </ol>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">When to use this integration</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-gray-700">
            <li>You use Dropbox for team collaboration</li>
            <li>You share proposals, contracts, or external documents</li>
            <li>You need visibility into document engagement</li>
            <li>You want to trigger actions from user behavior</li>
          </ul>
          <p className="mt-6 text-base leading-7 text-gray-700">
            <strong>Not ideal if:</strong> you only use Dropbox internally and do not need tracking or workflow automation.
          </p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Dropbox alone vs with Coneshare</h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-900">Capability</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">Dropbox</th>
                  <th className="px-4 py-3 font-semibold text-gray-900">With Coneshare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr><td className="px-4 py-3 text-gray-700">Storage and collaboration</td><td className="px-4 py-3 text-gray-700">Yes</td><td className="px-4 py-3 text-gray-700">Yes</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">External sharing control</td><td className="px-4 py-3 text-gray-700">Basic</td><td className="px-4 py-3 text-gray-700">Advanced</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">Viewer visibility</td><td className="px-4 py-3 text-gray-700">Limited</td><td className="px-4 py-3 text-gray-700">Enhanced</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">Engagement tracking</td><td className="px-4 py-3 text-gray-700">Limited</td><td className="px-4 py-3 text-gray-700">Detailed</td></tr>
                <tr><td className="px-4 py-3 text-gray-700">Workflow automation</td><td className="px-4 py-3 text-gray-700">Limited</td><td className="px-4 py-3 text-gray-700">Yes</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <div className="prose prose-lg max-w-none text-gray-700">
            <h2 className="text-gray-900">Related setups</h2>
            <ul>
              <li><Link href="/integrations/google-drive">Compare with Google Drive integration</Link></li>
              <li><Link href="/alternatives/docsend">Looking for a DocSend alternative?</Link></li>
            </ul>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Turn Dropbox sharing into actionable insight</h2>
          <p className="mt-4 text-base text-gray-200">Add control, visibility, and workflows on top of your existing storage.</p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View live demo
            </Link>
            <Link href="/alternatives/docsend" className="text-sm font-semibold text-white hover:text-gray-200">
              Explore DocSend alternative <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
