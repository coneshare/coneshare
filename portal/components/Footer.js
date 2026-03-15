export function Footer() {
  return (
    <footer className="bg-gray-50">
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-12 sm:py-16 lg:px-8">
        <nav className="-mb-6 columns-2 sm:flex sm:justify-center sm:space-x-12" aria-label="Footer">
            <div className="pb-6">
                <a href="/features" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Features</a>
            </div>
            <div className="pb-6">
                <a href="/solutions" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Solutions</a>
            </div>
            <div className="pb-6">
                <a href="/terms" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Terms</a>
            </div>
            <div className="pb-6">
                <a href="/privacy-policy" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Privacy</a>
            </div>
            <div className="pb-6">
                <a href="https://docs.coneshare.com/en/" target="_blank" rel="noopener noreferrer" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Docs</a>
            </div>
            <div className="pb-6">
                <a href="https://github.com/coneshare/coneshare" target="_blank" rel="noopener noreferrer" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Contribute</a>
            </div>
            <div className="pb-6">
                <a href="https://github.com/orgs/coneshare/discussions" target="_blank" rel="noopener noreferrer" className="text-sm leading-6 text-gray-600 hover:text-gray-900">Forum</a>
            </div>
        </nav>
        <p className="mt-10 text-center text-xs leading-5 text-gray-500">
          &copy; 2026 Coneshare, Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
