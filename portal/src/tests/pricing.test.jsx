import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PricingContent } from '../../app/pricing/PricingContent';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('/pricing PricingContent', () => {
  it('renders Community, Pro, and Enterprise tiers without billing toggle or Most Popular badge', () => {
    const { container } = render(<PricingContent />);

    expect(container.querySelector('[style*="radial-gradient"]')).toBeNull();

    expect(screen.getByRole('heading', { name: 'Community' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument();

    expect(screen.queryByText('Most Popular')).not.toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Monthly' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annual' })).not.toBeInTheDocument();

    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$2,999')).toBeInTheDocument();
    expect(screen.getByText('$9,999')).toBeInTheDocument();
  });

  it('includes enterprise software features and purchase CTA in Pro', () => {
    render(<PricingContent />);

    expect(screen.getByText('Unlimited team members and external visitors')).toBeInTheDocument();
    expect(
      screen.getByText(
        /White-labeling: remove Powered by badge, customize brand colors, favicon, and more/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Enterprise SSO, AD\/LDAP directory sync, and ADFS integration/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Cross-document full-text search across PDF, Office, and Markdown for internal users and dataroom visitors/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Compliance audit logs and security event export/)).toBeInTheDocument();
    expect(
      screen.getByText(/Technical support: email response within 1 business day from our engineering team/)
    ).toBeInTheDocument();

    const proCard = screen.getByRole('heading', { name: 'Pro' }).closest('div.rounded-2xl');
    expect(within(proCard).queryByText(/Slack/i)).not.toBeInTheDocument();

    const proCta = screen.getByRole('link', { name: /Contact Sales for Pro/i });
    expect(proCta).toHaveAttribute(
      'href',
      'mailto:dev@coneshare.com?subject=ConeShare%20Pro%20Inquiry'
    );
  });

  it('positions Enterprise for multi-tenancy, HA/air-gapped, 24h Slack SLA, and co-development', () => {
    render(<PricingContent />);

    expect(
      screen.getByText(/Multi-tenancy architecture with isolated Multi-Org management/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /HA and offline delivery: multi-node high-availability clusters or fully air-gapped on-prem deployments/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Priority SLA: dedicated Slack channel with engineering response and resolution within 24 hours/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Co-development: shared features prioritized in 2-4 weeks; dedicated private branches for bespoke workflows/
      )
    ).toBeInTheDocument();
  });

  it('renders Managed BYOC section without Pro license bundled, at $1,999/yr or $199/mo', () => {
    render(<PricingContent />);

    const byocHeading = screen.getByRole('heading', {
      name: /Managed BYOC \(Official Managed Private Cloud\)/,
    });
    expect(byocHeading).toBeInTheDocument();

    const byocCard = byocHeading.closest('div.rounded-2xl');
    expect(within(byocCard).queryByText('$3,999')).not.toBeInTheDocument();
    expect(within(byocCard).queryByText('$450 / month')).not.toBeInTheDocument();
    expect(within(byocCard).getByText('$1,999')).toBeInTheDocument();
    expect(within(byocCard).getByText('$199 / month')).toBeInTheDocument();
    expect(within(byocCard).getByText('3-mo minimum')).toBeInTheDocument();
    expect(within(byocCard).getByText('14-day refund guarantee')).toBeInTheDocument();
    expect(within(byocCard).queryByText(/Includes Pro license/i)).not.toBeInTheDocument();
    expect(
      within(byocCard).getByText(
        /simply add a Pro license \(\+\$2,999 \/ year, totaling \$4,998 \/ year\)/
      )
    ).toBeInTheDocument();

    expect(
      within(byocCard).getByText(
        /Official turnkey setup: custom domain, automated SSL certificates, and centralized logs/
      )
    ).toBeInTheDocument();
    expect(
      within(byocCard).getByText(/Large-file transcoding and streaming playback performance tuning/)
    ).toBeInTheDocument();
    expect(
      within(byocCard).getByText(/Off-peak security updates and regular database backup verification/)
    ).toBeInTheDocument();
    expect(
      within(byocCard).getByText(
        /Managed ops support: email response within 1 business day for deployment, upgrades, and incidents/
      )
    ).toBeInTheDocument();

    expect(screen.queryByText(/setup fee/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,697/)).not.toBeInTheDocument();
  });

  it('renders Compare Features table with all categories and Community vs Pro differences', () => {
    render(<PricingContent />);

    expect(screen.getByRole('heading', { name: 'Compare Features' })).toBeInTheDocument();

    const categories = [
      'Datarooms & Documents',
      'Document Analytics & Tracking',
      'Share Link Settings',
      'Supported File Types',
      'User & Identity Management',
      'Security & Audit',
      'Custom Branding',
      'Support',
    ];
    categories.forEach((cat) => {
      expect(screen.getByText(cat)).toBeInTheDocument();
    });

    const featureTable = screen.getAllByRole('table')[0];
    const tableRows = within(featureTable).getAllByRole('row');
    expect(tableRows[1]).toHaveTextContent('Datarooms & Documents');

    const proOnlyFeatures = [
      'Full-text search (PDF / Office / Markdown)',
      'Analytics data export',
      'SSO with AD/LDAP directory sync',
      'SSO with ADFS integration',
      'Compliance audit log',
      'Full white-labeling (remove Powered by badge, etc.)',
      'Email support',
      'Response within 1 business day',
    ];
    proOnlyFeatures.forEach((feature) => {
      expect(screen.getByLabelText(`Community does not support ${feature}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Pro supports ${feature}`)).toBeInTheDocument();
    });

    const supportCategoryRowIndex = tableRows.findIndex(
      (row) => row.textContent === 'Support'
    );
    expect(supportCategoryRowIndex).toBeGreaterThan(-1);
    expect(tableRows[supportCategoryRowIndex + 1]).toHaveTextContent(
      'GitHub / community forum support'
    );
    expect(tableRows[supportCategoryRowIndex + 2]).toHaveTextContent('Email support');

    const retentionRowIndex = tableRows.findIndex((row) =>
      row.textContent.includes('Analytics retention')
    );
    expect(retentionRowIndex).toBeGreaterThan(-1);
    expect(tableRows[retentionRowIndex + 1]).toHaveTextContent('Analytics data export');

    const sharedFeatures = [
      'SSO single sign-on (with Dex)',
      'Dynamic watermarks',
      'Custom organization logo',
      'Custom dataroom banners',
      'GitHub / community forum support',
    ];
    sharedFeatures.forEach((feature) => {
      expect(screen.getByLabelText(`Community supports ${feature}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Pro supports ${feature}`)).toBeInTheDocument();
    });

    expect(screen.getAllByText('Unlimited (self-managed)')).toHaveLength(2);
  });

  it('renders Paid Support informational block with hourly pricing only and without CTA buttons', () => {
    render(<PricingContent />);

    const supportHeading = screen.getByRole('heading', {
      name: 'Support (Paid Engineering Support)',
    });
    expect(supportHeading).toBeInTheDocument();

    const supportCard = supportHeading.closest('div.rounded-2xl');
    expect(within(supportCard).getByText('$150')).toBeInTheDocument();
    expect(within(supportCard).getByText('/ hour')).toBeInTheDocument();
    expect(within(supportCard).queryByText('$5,000')).not.toBeInTheDocument();
    expect(within(supportCard).queryByText('/ year')).not.toBeInTheDocument();
    expect(within(supportCard).queryByText('One-time support')).not.toBeInTheDocument();
    expect(
      within(supportCard).getByText(/Includes Email \/ Slack \/ Remote Session/)
    ).toBeInTheDocument();
    expect(within(supportCard).queryAllByRole('link')).toHaveLength(0);
    expect(within(supportCard).queryAllByRole('button')).toHaveLength(0);
  });

  it('toggles FAQ items interactively', () => {
    render(<PricingContent />);

    const faqQuestion = screen.getByRole('button', {
      name: /How should our team choose between Pro, Managed BYOC, and Enterprise\?/,
    });
    expect(
      screen.queryByText(/All paid plans include unlimited team members and external visitors\./)
    ).not.toBeInTheDocument();

    fireEvent.click(faqQuestion);
    expect(
      screen.getByText(/All paid plans include unlimited team members and external visitors\./)
    ).toBeInTheDocument();
  });
});
