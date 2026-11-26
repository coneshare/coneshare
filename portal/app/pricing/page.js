import { PricingContent } from './PricingContent';

export const metadata = {
  title: 'Pricing & Plans - Self-Hosted Virtual Dataroom (VDR) & Managed BYOC | ConeShare',
  description:
    'No per-seat pricing and no team size limits. Deploy open-source Community for free, book $299 Done-For-You self-hosted setup, or choose Managed BYOC private cloud hosting — with data residency on your own servers.',
  keywords: [
    'ConeShare pricing',
    'virtual dataroom cost',
    'DocSend alternative pricing',
    'self hosted vdr',
    'done for you self hosted setup',
    'byoc dataroom',
    'vdr price comparison',
  ],
  alternates: {
    canonical: '/pricing',
  },
};

export default function PricingPage() {
  return <PricingContent />;
}
