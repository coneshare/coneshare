import { PricingContent } from './PricingContent';

export const metadata = {
  title: 'Pricing & Plans - Self-Hosted Virtual Dataroom (VDR) | ConeShare',
  description:
    'No per-seat pricing and no team size limits. Choose open-source Community, commercial self-hosted Pro, Managed BYOC private cloud, or Enterprise for high availability and custom engineering — with data residency in your own cloud.',
  keywords: [
    'ConeShare pricing',
    'virtual dataroom cost',
    'DocSend alternative pricing',
    'self hosted vdr',
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
