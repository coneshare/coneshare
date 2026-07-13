import Link from 'next/link';

export const metadata = {
  title: 'Page Moved | Coneshare',
  description: 'Redirecting to /virtual-dataroom...',
  alternates: {
    canonical: '/virtual-dataroom',
  },
  other: {
    'refresh': '0; url=/virtual-dataroom',
  }
};

export default function NextcloudVdrRedirect() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        Page Moved
      </h1>
      <p className="mt-4 text-base text-gray-600">
        Redirecting you to our new{' '}
        <Link href="/virtual-dataroom" className="font-semibold text-gray-900 underline">
          Virtual Dataroom Page
        </Link>...
      </p>
    </div>
  );
}
