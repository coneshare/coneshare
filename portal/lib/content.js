import { ShieldCheck, LineChart, Droplets, HardDrive, Folders, Cloud, TrendingUp, Landmark, Target } from 'lucide-react';
import Image from 'next/image';

export const features = [
  {
    slug: 'secure-sharing',
    name: 'Secure Document & Dataroom Sharing',
    menuName: 'Secure Sharing',
    description: 'Share sensitive documents with confidence. Coneshare\'s link-based sharing system gives you complete control over who sees your content and how they access it.',
    icon: ShieldCheck,
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Granular Access Control</h3>
        <p className="mb-4">Protect every link with robust security settings including password protection, email verification, download restrictions, and link expiration. You have full control over your shared content.</p>
        <Image src="/screenshots/feat-sharing.png" alt="Screenshot of creating a secure share link" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Live Document Updates</h3>
        <p>Fix a typo or update a file by uploading a new version. All existing share links will automatically point to the latest version, ensuring everyone stays on the same page without you having to resend links.</p>
        <Image src="/screenshots/feat-sharing2.png" alt="Screenshot of creating a secure share link" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />
      </div>
    )
  },
  {
    slug: 'advanced-analytics',
    name: 'Advanced Analytics & Tracking',
    menuName: 'Analytics & Tracking',
    description: 'Gain actionable insights into how your shared documents are being consumed with real-time, page-by-page analytics.',
    icon: LineChart,
    content: (
       <div>
        <h3 className="text-xl font-semibold mb-4">Real-Time View Notifications</h3>
        <p className="mb-4">Opt-in to receive an email notification the moment someone views your shared link, so you can follow up at the perfect time.</p>
        <Image src="/screenshots/feat-notification.png" alt="Screenshot of real time view notifications" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Page-by-Page Analytics</h3>
        <p>Understand what content resonates most with detailed, page-by-page analytics, including time spent on each page and overall completion rate. See who is viewing your documents, where they are from, and what device they are using.</p>
        <Image src="/screenshots/feat-analytics.png" alt="Screenshot of document analytics and viewer insights" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />
      </div>
    )
  },
  {
    slug: 'dynamic-watermarking',
    name: 'Dynamic Watermarking',
    menuName: 'Dynamic Watermarking',
    description: 'Prevent unauthorized sharing and protect intellectual property with dynamic watermarks that are applied on the fly.',
    icon: Droplets,
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Dynamic, Viewer-Specific Content</h3>
        <p className="mb-4">Automatically embed viewer-specific information into the watermark, such as their email address or IP address, to deter leaks and trace their source.</p>
        <Image src="/screenshots/feat-watermark.png" alt="Screenshot of dynamic watermarking" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Pervasive Protection</h3>
        <p>Watermarks are tiled across the entire document and applied to both in-browser previews and downloaded PDF files, ensuring persistent protection of your intellectual property.</p>
        <Image src="/screenshots/feat-watermark2.png" alt="Screenshot of dynamic watermarking" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />
      </div>
    )
  },
  {
    slug: 'virtual-data-rooms',
    name: 'Virtual Data Rooms (VDRs)',
    menuName: 'Virtual Data Rooms',
    description: 'Organize, manage, and share collections of documents and folders in a secure, structured environment.',
    icon: Folders,
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Easy Setup and Management</h3>
        <p>Create and organize unlimited data rooms in minutes. Add existing documents, create nested folders, and manage content with an intuitive interface.</p>
        <Image src="/screenshots/feat-vdr-add-content.png" alt="Screenshot of virtual dataroom" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Granular Link Permissions</h3>
        <p className="mb-4">When sharing a data room, you retain fine-grained control. Set unique visibility, download, and watermarking rules for every individual file and folder within that specific share link.</p>
        <Image src="/screenshots/feat-vdr-manage-perm.png" alt="Screenshot of virtual dataroom" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />
      </div>
    )
  },
  {
    slug: 'cloud-storage-integration',
    name: 'Cloud Storage Integration',
    menuName: 'Cloud Integration',
    description: 'Seamlessly import files from your existing cloud storage like Dropbox, Google Drive, and Nextcloud.',
    icon: Cloud,
    content: (
       <div>
        <h3 className="text-xl font-semibold mb-4">Connect Your Accounts</h3>
        <p className="mb-4">Securely connect to popular public cloud services like Dropbox and Google Drive, as well as self-hosted private cloud platforms like Nextcloud, all via standard OAuth2.</p>
        <Image src="/screenshots/feat-cloud-import.png" alt="Screenshot of connecting cloud" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Asynchronous Imports</h3>
        <p>Select files to import, and Coneshare's background workers will handle the download and processing, ensuring the UI remains responsive while you work.</p>
        <Image src="/screenshots/feat-dropbox.png" alt="Screenshot of dropbox importing" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

      </div>
    )
  },
  {
    slug: 'self-hosted',
    name: 'Self-Hosted & Enterprise-Ready',
    menuName: 'Self-Hosting',
    description: 'Built for security-conscious organizations, Coneshare runs entirely on your own infrastructure, giving you total data sovereignty.',
    icon: HardDrive,
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Total Data Sovereignty</h3>
        <p className="mb-4">With no reliance on third-party services, you have complete control over your data, ensuring compliance with regulations like GDPR and HIPAA.</p>
        <h3 className="text-xl font-semibold mb-4">Containerized Deployment</h3>
        <p>Deploy the entire stack with ease using the provided Docker Compose configuration, giving you a production-ready system in minutes.</p>
      </div>
    )
  },
];

export const solutions = [
  {
    slug: 'secure-fundraising',
    name: 'For Secure Fundraising',
    menuName: 'Secure Fundraising',
    description: 'Streamline your fundraising process from pitch to due diligence. Control your pitch deck, track investor engagement page-by-page, and use secure VDRs for due diligence.',
    icon: TrendingUp,
    quote: "As a VC, the decks sent via a platform like Coneshare immediately stand out. It shows the founders are serious about security and gives us confidence.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Control Your Pitch Deck</h3>
        <p className="mb-4">Share your deck using a secure link and track investor engagement page by page. See which slides are getting the most attention and identify truly interested parties. If an investor passes, deactivate their link instantly.</p>
        <h3 className="text-xl font-semibold mb-4">Secure Data Rooms for Due Diligence</h3>
        <p>Create VDRs for serious investors. Use granular permissions to reveal documents in stages, require email verification, and apply dynamic watermarks with the investor's email address to deter leaks.</p>
      </div>
    )
  },
  {
    slug: 'regulated-industries',
    name: 'For Regulated Industries',
    menuName: 'Regulated Industries',
    description: 'Share sensitive client information for legal, finance, or healthcare with the assurance of complete data sovereignty by self-hosting on your own network.',
    icon: Landmark,
    quote: "Our law firm can't afford client data on a multi-tenant cloud service. Coneshare gives us modern VDR features with on-premise security.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Meet Compliance Requirements</h3>
        <p className="mb-4">By self-hosting Coneshare, you ensure all data stays within your network, helping you meet strict compliance standards like HIPAA or GDPR without trusting a third-party vendor with your sensitive files.</p>
        <h3 className="text-xl font-semibold mb-4">Client Portals</h3>
        <p>Use Datarooms to create secure client portals. Share discovery documents, contracts, and reports. Granular permissions ensure clients only see the files relevant to them.</p>
      </div>
    )
  },
  {
    slug: 'sales-and-marketing',
    name: 'For Sales & Marketing Teams',
    menuName: 'Sales & Marketing',
    description: 'Arm your sales team with insights to close deals faster. Track proposal engagement, tailor your follow-up, and ensure brand consistency with a central content library.',
    icon: Target,
    quote: "Before Coneshare, we sent PDFs into the void. Now, our sales team can focus on prospects who are actually engaged with our materials.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Track Proposal Engagement</h3>
        <p className="mb-4">Stop guessing if your proposal was read. Get notified when a prospect opens your document and see exactly which pages they focused on. Tailor your follow-up call to address their specific interests.</p>
        <h3 className="text-xl font-semibold mb-4">Centralized Content Library</h3>
        <p>Manage all your sales collateral—brochures, case studies, price sheets—in one place. When you update a document, every link your sales team has ever sent is automatically updated to the latest version.</p>
      </div>
    )
  },
];
