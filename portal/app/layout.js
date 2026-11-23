import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AnnouncementBanner } from '../components/AnnouncementBanner';
import { LocaleSuggestionBanner } from '../components/LocaleSuggestionBanner';
import { NavigationProgress } from '../components/NavigationProgress';
import { PageTransition } from '../components/PageTransition';
import { getBilingualBlogSlugs } from '../lib/blog';
import { getBilingualHelpSlugs } from '../lib/help';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  metadataBase: new URL('https://www.coneshare.com'),
  title: 'Coneshare: Document Control and Intelligence Layer',
  description: 'Keep your storage workflow and add secure, trackable data rooms with controlled sharing, engagement visibility, and workflow automation.',
  alternates: {
    types: {
      'application/rss+xml': '/blog/rss.xml',
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],    
  },
  verification: {
    google: 'Sudow8xymk-f09r-u5KWAI4vln9Z39omDVZqzHI0T8s',
  },  
};

export default async function RootLayout({ children }) {
  const [translatedBlogSlugs, translatedHelpSlugs] = await Promise.all([
    getBilingualBlogSlugs(),
    getBilingualHelpSlugs(),
  ]);

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-800`}>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-ZBF9GZP54S"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-ZBF9GZP54S');
          `}
        </Script>
        <div className="flex min-h-screen flex-col">
          <NavigationProgress />
          <AnnouncementBanner />
          <Header />
          <PageTransition className="flex-grow">{children}</PageTransition>
          <Footer
            translatedBlogSlugs={translatedBlogSlugs}
            translatedHelpSlugs={translatedHelpSlugs}
          />
          <LocaleSuggestionBanner
            translatedBlogSlugs={translatedBlogSlugs}
            translatedHelpSlugs={translatedHelpSlugs}
          />
        </div>
      </body>
    </html>
  );
}
