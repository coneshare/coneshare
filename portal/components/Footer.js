export function Footer() {
  const footerSections = [
    {
      title: 'Product',
      links: [
        { label: 'Virtual Dataroom', href: '/virtual-dataroom' },
        { label: 'Nextcloud Integration', href: '/integrations/nextcloud' },
        { label: 'Google Drive Integration', href: '/integrations/google-drive' },
        { label: 'Dropbox Integration', href: '/integrations/dropbox' },
        { label: 'Features', href: '/features' },
        { label: 'Solutions', href: '/solutions' },
        { label: 'Get Started', href: 'https://app.coneshare.com/signup', external: true },

      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Blog', href: '/blog' },
        { label: 'Community Forum', href: 'https://github.com/orgs/coneshare/discussions', external: true },
        { label: 'Contribute', href: 'https://github.com/coneshare/coneshare', external: true },
        { label: 'Documentation', href: 'https://docs.coneshare.com/en/', external: true },
        { label: 'API Reference', href: 'https://app.coneshare.com/api/schema/swagger/', external: true },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Live Demo', href: '/demo' },
        { label: 'Contact Sales', href: 'mailto:sales@coneshare.com' },
        { label: 'Support', href: 'mailto:dev@coneshare.com' },
        { label: 'Security Contact', href: 'mailto:dev@coneshare.com' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Terms', href: '/terms' },
        { label: 'Privacy Policy', href: '/privacy-policy' },
      ],
    },
  ];

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid gap-10 border-b border-gray-200 pb-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <a href="/" className="inline-flex items-center gap-2 text-base font-semibold text-gray-900">
              <img src="/logo-cropped.svg" alt="Coneshare logo" className="h-7 w-7" />
              <span>Coneshare</span>
            </a>
            <p className="mt-4 max-w-sm text-sm leading-6 text-gray-600">
              Open-source document sharing and datarooms with controlled access and automation workflows.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700">Self-hosted</span>
              <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700">Enterprise support</span>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8" aria-label="Footer">
            {footerSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                <ul className="mt-4 space-y-3">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-gray-600 transition-colors hover:text-gray-900"
                        {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 Coneshare. All rights reserved.</p>
          <p>Need procurement or security review support? Contact sales@coneshare.com.</p>
        </div>
      </div>
    </footer>
  );
}
