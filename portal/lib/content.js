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
    description: 'Never miss the moment an investor engages with your deck. Convert viewing signals into timely follow-up actions.',
    icon: TrendingUp,
    quote: "As a VC, the decks sent via a platform like Coneshare immediately stand out. It shows the founders are serious about security and gives us confidence.",
    problem: 'Founders often learn investor interest too late, after the strongest engagement window has passed.',
    trigger: 'An investor views, revisits, or downloads a pitch deck or dataroom file.',
    action: 'Coneshare sends event signals to Slack or webhook destinations so founders and advisors can coordinate immediately.',
    outcome: 'Faster, better-timed follow-ups and more prepared investor conversations.',
    bestFor: 'Founders and fundraising teams',
    primarySignal: 'Deck open/revisit/download events',
    successMetric: 'Faster investor follow-up response time',
    keywords: ['investor deck tracking', 'fundraising engagement alerts', 'pitch deck view notifications'],
    relatedSlugs: ['timely-follow-ups', 'deal-visibility'],
    selfHostedWhy: 'Investor materials stay inside your own infrastructure throughout sharing, tracking, and automation.',
    workflowSteps: [
      'Share pitch deck or dataroom link with secure controls.',
      'Investor activity event is captured in real time.',
      'Slack/webhook automation notifies the internal team.',
      'Founder follows up while engagement is still fresh.',
    ],
    proof: {
      src: '/screenshots/feat-notification.png',
      alt: 'Investor engagement notification example',
      caption: 'Real-time investor activity notifications trigger coordinated follow-ups.',
    },
    docsUrl: 'https://docs.coneshare.com/en/',
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Problem</h3>
        <p className="mb-4">{'Founders often learn investor interest too late, after the strongest engagement window has passed.'}</p>
        <h3 className="text-xl font-semibold mb-4">Trigger → Action</h3>
        <p className="mb-4">{'When an investor views, revisits, or downloads key materials, Coneshare can alert your team instantly through Slack or webhooks.'}</p>
        <h3 className="text-xl font-semibold mb-4">Outcome</h3>
        <p>{'Move faster with better follow-up timing and stronger investor context before each conversation.'}</p>
      </div>
    )
  },
  {
    slug: 'engagement-visibility',
    name: 'Engagement Visibility',
    menuName: 'Engagement Visibility',
    description: 'Separate real prospects from noise by tracking views, downloads, and revisits across documents and datarooms.',
    icon: Landmark,
    quote: "Our law firm can't afford client data on a multi-tenant cloud service. Coneshare gives us modern VDR features with on-premise security.",
    problem: 'Teams struggle to prioritize outreach when engagement intent is hidden across shared files.',
    trigger: 'Prospects repeatedly view, download, or re-open specific files and dataroom sections.',
    action: 'Coneshare turns these activity events into actionable signals delivered to internal systems.',
    outcome: 'Sales and deal teams focus attention on accounts showing clear engagement momentum.',
    bestFor: 'Sales ops and deal teams',
    primarySignal: 'Repeated view/download activity',
    successMetric: 'Higher conversion on high-intent accounts',
    keywords: ['document engagement visibility', 'proposal activity tracking', 'high-intent account signals'],
    relatedSlugs: ['team-awareness', 'deal-visibility'],
    selfHostedWhy: 'Sensitive engagement data remains in your environment, not in third-party multi-tenant analytics pipelines.',
    workflowSteps: [
      'Share proposals, decks, or dataroom content.',
      'Coneshare captures event-level engagement signals.',
      'Signals are routed to Slack/webhooks and internal tooling.',
      'Team prioritizes high-engagement accounts first.',
    ],
    proof: {
      src: '/screenshots/feat-analytics.png',
      alt: 'Engagement analytics view with document activity',
      caption: 'Page-level analytics and event activity provide better account prioritization.',
    },
    docsUrl: 'https://docs.coneshare.com/en/',
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Problem</h3>
        <p className="mb-4">{'Teams struggle to prioritize outreach when engagement intent is hidden across shared files.'}</p>
        <h3 className="text-xl font-semibold mb-4">Trigger → Action</h3>
        <p className="mb-4">{'Coneshare detects repeated document activity and routes the signal to Slack/webhooks so internal systems reflect real engagement quickly.'}</p>
        <h3 className="text-xl font-semibold mb-4">Outcome</h3>
        <p>{'Spend less time guessing and more time on active opportunities.'}</p>
      </div>
    )
  },
  {
    slug: 'team-awareness',
    name: 'Team Awareness',
    menuName: 'Team Awareness',
    description: 'Keep your sales team in the loop instantly when prospects open proposals or enter datarooms.',
    icon: Target,
    quote: "Before Coneshare, we sent PDFs into the void. Now, our sales team can focus on prospects who are actually engaged with our materials.",
    problem: 'Important buying signals are often trapped in one person’s inbox or discovered too late for coordinated action.',
    trigger: 'A prospect opens a proposal, revisits a deck, or enters a shared dataroom.',
    action: 'Coneshare automatically notifies account owners, managers, and support teams through shared channels.',
    outcome: 'The whole team stays aligned without manual status updates.',
    bestFor: 'Revenue and account teams',
    primarySignal: 'Proposal/dataroom access events',
    successMetric: 'Shorter internal handoff and response cycles',
    keywords: ['sales team alerts', 'proposal open notifications', 'team workflow automation'],
    relatedSlugs: ['engagement-visibility', 'timely-follow-ups'],
    selfHostedWhy: 'Internal deal activity can be shared across your teams while still remaining inside your infrastructure boundary.',
    workflowSteps: [
      'Sales shares proposal or dataroom link.',
      'Prospect activity event is generated instantly.',
      'Coneshare distributes alerts to team channels.',
      'Team executes next step with shared context.',
    ],
    proof: {
      src: '/screenshots/automation-rules.png',
      alt: 'Automation rules configured for team alerts',
      caption: 'Automation rules keep account teams aligned from the first engagement signal.',
    },
    docsUrl: 'https://docs.coneshare.com/en/',
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Problem</h3>
        <p className="mb-4">{'Buying signals are often isolated, slowing team response and reducing momentum.'}</p>
        <h3 className="text-xl font-semibold mb-4">Trigger → Action</h3>
        <p className="mb-4">{'Prospect engagement events automatically trigger shared alerts so everyone sees the same signal at the same time.'}</p>
        <h3 className="text-xl font-semibold mb-4">Outcome</h3>
        <p>{'Improve coordination and response speed without manual reporting loops.'}</p>
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
    problem: 'Follow-ups often happen too early or too late because teams rely on guesswork instead of engagement signals.',
    trigger: 'A prospect hits a meaningful event such as first open, repeat view, or download.',
    action: 'Coneshare triggers the follow-up workflow and routes it to the right destination instantly.',
    outcome: 'Outreach happens at peak interest, improving conversion likelihood.',
    bestFor: 'Outbound and closing reps',
    primarySignal: 'High-intent engagement event triggers',
    successMetric: 'Improved follow-up timing and reply rate',
    keywords: ['timely follow-up automation', 'document event triggers', 'sales follow-up timing'],
    relatedSlugs: ['team-awareness', 'secure-fundraising'],
    selfHostedWhy: 'Follow-up automation can integrate with internal systems while preserving data sovereignty.',
    workflowSteps: [
      'Define event conditions for follow-up timing.',
      'Coneshare monitors document activity continuously.',
      'Matched events trigger alerts/tasks through Slack or webhooks.',
      'Rep follows up while intent is highest.',
    ],
    proof: {
      src: '/screenshots/automation-logs.png',
      alt: 'Automation delivery logs with retry and replay',
      caption: 'Delivery logs, retry, and replay keep follow-up automations dependable.',
    },
    docsUrl: 'https://docs.coneshare.com/en/',
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Problem</h3>
        <p className="mb-4">{'Without reliable engagement timing, teams miss high-intent follow-up windows.'}</p>
        <h3 className="text-xl font-semibold mb-4">Trigger → Action</h3>
        <p className="mb-4">{'Coneshare turns meaningful events into immediate workflow actions, reducing lag between signal and outreach.'}</p>
        <h3 className="text-xl font-semibold mb-4">Outcome</h3>
        <p>{'Better timing and stronger conversion performance from each follow-up attempt.'}</p>
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
    problem: 'Deal conversations are weaker when teams lack clear visibility into buyer document behavior.',
    trigger: 'Buyers engage unevenly across dataroom folders, key files, and repeated document sections.',
    action: 'Coneshare captures these signals and shares them as pre-call context for the internal deal team.',
    outcome: 'Conversations become more relevant, evidence-based, and aligned with buyer interest.',
    bestFor: 'Dataroom and transaction teams',
    primarySignal: 'Buyer behavior across dataroom/file tree',
    successMetric: 'Higher quality deal conversations',
    keywords: ['dataroom deal visibility', 'buyer behavior tracking', 'dataroom activity insights'],
    relatedSlugs: ['engagement-visibility', 'secure-fundraising'],
    selfHostedWhy: 'Deal activity telemetry remains private and controlled, which is critical for sensitive transactions.',
    workflowSteps: [
      'Buyer accesses shared dataroom and documents.',
      'Coneshare logs event-level engagement by file/activity.',
      'Signals are surfaced to internal teams before calls.',
      'Team adjusts conversation based on actual buyer behavior.',
    ],
    proof: {
      src: '/screenshots/feat-vdr-manage-perm.png',
      alt: 'Dataroom management and engagement context',
      caption: 'Dataroom activity and document interaction signals improve pre-call readiness.',
    },
    docsUrl: 'https://docs.coneshare.com/en/',
    content: (
      <div>
        <h3 className="text-xl font-semibold mb-4">Problem</h3>
        <p className="mb-4">{'Teams need better context before buyer calls than generic open-rate signals.'}</p>
        <h3 className="text-xl font-semibold mb-4">Trigger → Action</h3>
        <p className="mb-4">{'Coneshare captures dataroom and document activity and routes it to your team as actionable call preparation context.'}</p>
        <h3 className="text-xl font-semibold mb-4">Outcome</h3>
        <p>{'Drive smarter conversations and improve deal execution with evidence-backed context.'}</p>
      </div>
    )
  },
];
