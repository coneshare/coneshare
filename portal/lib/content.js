import { ShieldCheck, LineChart, Droplets, HardDrive, Folders, Cloud, UploadCloud, TrendingUp, Landmark, Target, Workflow } from 'lucide-react';
import Image from 'next/image';

export const features = [
  {
    slug: 'secure-sharing',
    name: 'Secure Document & Dataroom Sharing',
    menuName: 'Secure Sharing',
    description: 'Share sensitive documents with confidence using secure links, granular access controls, and dataroom-level permissions.',
    icon: ShieldCheck,
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Granular Access Control</h3>
        <p className="mb-4">Protect every link with robust security settings including password protection, email verification, download restrictions, and link expiration. You have full control over your shared content.</p>
        <Image src="/screenshots/feat-sharing.png" alt="Screenshot of creating a secure share link" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Live Document Updates</h3>
        <p>Update files without breaking links. Every shared link points to the latest version, so recipients always see current content without resending links.</p>
        <Image src="/screenshots/feat-sharing2.png" alt="Screenshot of creating a secure share link" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />
      </div>
    )
  },
  {
    slug: 'advanced-analytics',
    name: 'Engagement Awareness',
    menuName: 'Engagement Awareness',
    description: 'Understand how prospects interact with your content through real-time and page-level activity insights.',
    icon: LineChart,
    content: (
       <div>
        <h3 className="text-xl font-semibold mb-4">Real-Time Activity Notifications</h3>
        <p className="mb-4">Receive immediate event notifications when your shared documents are viewed, downloaded, or revisited so your team can follow up with strong timing.</p>
        <Image src="/screenshots/feat-notification.png" alt="Screenshot of real time view notifications" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Page-by-Page Analytics</h3>
        <p>See what content resonates with detailed page-level analytics, including time spent and completion rate. Understand engagement context before every follow-up conversation.</p>
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
    slug: 'workflow-automation-integration',
    name: 'Workflow Automation & Integrations',
    menuName: 'Automation & Integrations',
    description: 'Trigger workflows from document events and send activity to Slack, webhooks, and internal systems in real time.',
    icon: Workflow,
    content: (
       <div>
        <h3 className="text-xl font-semibold mb-4">Event-Driven Workflows</h3>
        <p className="mb-4">Map document events to actions so your team is alerted instantly when engagement happens. Route events to Slack channels, webhook endpoints, or downstream systems.</p>
        <Image src="/screenshots/automation-rules.png" alt="Screenshot of automation rules" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Reliable Delivery Operations</h3>
        <p>Use delivery logs with retry and replay support to keep automations dependable. Configure multiple destinations for the same event stream to keep every team aligned.</p>
        <Image src="/screenshots/automation-logs.png" alt="Screenshot of automation logs" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

      </div>
    )
  },
  {
    slug: 'file-requests',
    name: 'File Requests',
    menuName: 'File Requests',
    description: 'Securely request and receive files from anyone, directly into a designated folder, without requiring them to have an account.',
    icon: UploadCloud,
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Streamline Content Collection</h3>
        <p className="mb-4">Create a secure upload link for any folder. External collaborators can use this link to upload files directly to you, simplifying how you collect documents from clients, partners, or vendors.</p>
        <Image src="/screenshots/feat-filerequest1.png" alt="Screenshot of creating a file request link" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />

        <h3 className="text-xl font-semibold mb-4">Track Every Submission</h3>
        <p>The external uploader's name and email are automatically captured and displayed alongside the file, so you always know who uploaded what. All files are automatically owned by you, integrating seamlessly into your existing library.</p>
        <Image src="/screenshots/feat-filerequest2.png" alt="Screenshot of a file uploaded via a file request" width={1200} height={750} className="my-6 rounded-lg shadow-lg border" />
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
    name: 'Investor Awareness',
    menuName: 'Investor Awareness',
    description: 'Never miss the moment an investor views your deck. Trigger instant team alerts and follow up while your pitch is top of mind.',
    icon: TrendingUp,
    quote: "As a VC, the decks sent via a platform like Coneshare immediately stand out. It shows the founders are serious about security and gives us confidence.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Know Exactly When Investors Engage</h3>
        <p className="mb-4">Get real-time visibility into pitch deck activity so founders can time outreach when attention is highest.</p>
        <h3 className="text-xl font-semibold mb-4">Coordinate Follow-Ups with Confidence</h3>
        <p>Send event signals to Slack or webhooks so investor updates are shared immediately with your team and advisors.</p>
      </div>
    )
  },
  {
    slug: 'regulated-industries',
    name: 'Engagement Visibility',
    menuName: 'Engagement Visibility',
    description: 'Separate real prospects from noise by tracking views, downloads, and revisits across documents and datarooms.',
    icon: Landmark,
    quote: "Our law firm can't afford client data on a multi-tenant cloud service. Coneshare gives us modern VDR features with on-premise security.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Prioritize High-Engagement Accounts</h3>
        <p className="mb-4">Use real-time event streams to focus team effort on prospects actively interacting with your materials.</p>
        <h3 className="text-xl font-semibold mb-4">Push Signals into Internal Systems</h3>
        <p>Route activity events through webhooks to your CRM or internal tooling so engagement data is visible where your team already works.</p>
      </div>
    )
  },
  {
    slug: 'sales-and-marketing',
    name: 'Team Awareness',
    menuName: 'Team Awareness',
    description: 'Keep your sales team in the loop instantly when prospects open proposals or enter datarooms.',
    icon: Target,
    quote: "Before Coneshare, we sent PDFs into the void. Now, our sales team can focus on prospects who are actually engaged with our materials.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Automatic Team Alerts</h3>
        <p className="mb-4">Trigger Slack and webhook notifications from document events so your account owners, managers, and support teams move in sync.</p>
        <h3 className="text-xl font-semibold mb-4">Timely Follow-Up Motion</h3>
        <p>Reach out when interest is highest by pairing real-time engagement signals with simple event-driven workflow automations.</p>
      </div>
    )
  },
  {
    slug: 'timely-follow-ups',
    name: 'Timely Follow-Ups',
    menuName: 'Timely Follow-Ups',
    description: 'Follow up when interest is highest by triggering workflows from document views and downloads.',
    icon: Target,
    quote: "We stopped guessing when to follow up. Coneshare gives us precise timing signals from real document activity.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Engage at the Right Moment</h3>
        <p className="mb-4">Use real-time activity signals to contact prospects when they are actively reviewing your content.</p>
        <h3 className="text-xl font-semibold mb-4">Automate Next Steps</h3>
        <p>Trigger follow-up tasks and notifications from views and downloads to reduce manual coordination and improve response speed.</p>
      </div>
    )
  },
  {
    slug: 'deal-visibility',
    name: 'Deal Visibility',
    menuName: 'Deal Visibility',
    description: 'Understand how buyers explore your deal across datarooms and document interactions before every conversation.',
    icon: LineChart,
    quote: "Before each call, we know what the buyer actually reviewed and where they spent time.",
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Pre-Call Context</h3>
        <p className="mb-4">Review who viewed what, where engagement is strongest, and which files are being revisited so conversations are grounded in evidence.</p>
        <h3 className="text-xl font-semibold mb-4">Better Deal Execution</h3>
        <p>Use engagement context to drive smarter conversations and align your internal team around the most active opportunities.</p>
      </div>
    )
  },
];
