import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Coneshare: Document Control and Intelligence Layer',
  description: 'Keep your storage workflow and add secure, trackable data rooms with controlled sharing, engagement visibility, and workflow automation.',
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

export default function RootLayout({ children }) {
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
          <Header />
          <main className="flex-grow">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
