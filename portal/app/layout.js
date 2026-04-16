import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Coneshare: Real-Time Document Tracking and Workflow Automation',
  description: 'Track document views and downloads in real time, trigger Slack and webhook workflows instantly, and keep secure sharing on your own infrastructure.',
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
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-grow">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
