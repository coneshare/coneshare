import Link from 'next/link';

export const metadata = {
  title: 'Embed File Upload Form on Your Website | Coneshare',
  description:
    'Embed Coneshare file request upload pages on your own website using iframe snippets and reverse proxy security headers.',
  keywords: [
    'embed upload form',
    'iframe upload widget',
    'file request embed',
    'secure file intake',
  ],
  alternates: {
    canonical: '/features/file-request-embed',
  },
};

const iframeSnippet = `<iframe
  src="https://app.coneshare.com/upload/zDgMPy5kRgNy78K8c2XSQg?embed=1"
  title="Secure file upload"
  width="100%"
  height="760"
  style="border:0;max-width:720px"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>`;

const iframeTemplateSnippet = `<iframe
  src="https://app.coneshare.com/upload/<file_request_slug>?embed=1"
  title="Secure file upload"
  width="100%"
  height="760"
  style="border:0;max-width:720px"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>`;

const nginxSnippet = `# Default: deny framing for all routes
location / {
  proxy_pass http://coneshare_upstream;
  add_header X-Frame-Options "DENY" always;
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
}

# Embed-enabled upload route only
location ~ ^/upload/ {
  proxy_pass http://coneshare_upstream;

  # Remove restrictive upstream headers on embed route
  proxy_hide_header X-Frame-Options;
  proxy_hide_header Content-Security-Policy;

  # Explicit allowlist for trusted embed origins
  add_header Content-Security-Policy "frame-ancestors 'self' https://www.example.com" always;
}`;

export default function FileRequestEmbedPage() {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">Website Intake</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Embed file request uploads on your own website
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Use existing Coneshare file request links as embeddable upload forms, so users can submit files directly
            from your site without redirecting to a separate domain.
          </p>
        </div>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">1. Iframe snippet</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">Example snippet using a real file request link:</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
            <code>{iframeSnippet}</code>
          </pre>
          <p className="mt-6 text-base leading-7 text-gray-700">
            Reusable template:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
            <code>{iframeTemplateSnippet}</code>
          </pre>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">2. Live embed preview</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">
            This preview embeds <code>https://app.coneshare.com/upload/zDgMPy5kRgNy78K8c2XSQg</code> directly for documentation and testing.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <iframe
              src="https://app.coneshare.com/upload/zDgMPy5kRgNy78K8c2XSQg?embed=1"
              title="Coneshare upload embed preview"
              width="100%"
              height="760"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">3. Reverse proxy headers (required)</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">
            In production, configure embed security headers at your front reverse proxy (HTTPS edge), not inside the
            Coneshare container runtime config.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-900 p-4 text-sm text-gray-100">
            <code>{nginxSnippet}</code>
          </pre>
          <ul className="mt-5 space-y-2 text-base leading-7 text-gray-700">
            <li>Use explicit HTTPS origins in <code>frame-ancestors</code>.</li>
            <li>Avoid wildcard origins in production.</li>
            <li>If your app is mounted under a prefix (for example <code>/app/upload/...</code>), adjust route matching.</li>
          </ul>
        </section>

        <section className="mx-auto mt-12 max-w-4xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">4. Upload flow and validation</h2>
          <p className="mt-4 text-base leading-7 text-gray-700">
            Embed mode uses the same backend flow and validations as standard public upload:
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-7 text-gray-700">
            <li>Request upload URL (<code>/api/v1/public/file-requests/&lt;slug&gt;/request-upload/</code>)</li>
            <li>Direct upload to returned pre-signed URL</li>
            <li>Finalize upload (<code>/api/v1/public/file-requests/&lt;slug&gt;/finalize-upload/</code>)</li>
          </ol>
          <p className="mt-4 text-base leading-7 text-gray-700">
            Size limits, allowed types, active/expiry checks, quota checks, and finalize validations are unchanged.
          </p>
        </section>

        <section className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gray-900 px-8 py-10 text-center text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Need end-to-end setup guidance?</h2>
          <p className="mt-4 text-base text-gray-200">
            See full feature documentation for file requests and embed security details.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6">
            <Link href="/demo" className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100">
              View live demo
            </Link>
            <Link href="https://docs.coneshare.com/en/" className="text-sm font-semibold text-white hover:text-gray-200">
              Read docs <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
