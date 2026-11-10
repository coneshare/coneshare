import { PricingContent } from './PricingContent';

export const metadata = {
  title: 'Pricing & Plans - Self-Hosted Virtual Dataroom (VDR) | ConeShare',
  description:
    'Predictable flat pricing with no per-seat fees. Run ConeShare on your own cloud with 100% data sovereignty. Choose between open-source community, managed BYOC, or enterprise.',
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
