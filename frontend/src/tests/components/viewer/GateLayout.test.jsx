import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GateLayout } from '../../../components/viewer/GateLayout';
import '../../../i18n';

describe('GateLayout', () => {
  it('renders top utility bar, card branding, and footer', () => {
    render(
      <GateLayout
        publicMeta={{
          organization_name: 'Acme Global',
          target_type: 'dataroom',
          target_name: 'Diligence Vault',
          owner_name: 'Bob Manager',
        }}
      >
        <div data-testid="child-content">Child Form Content</div>
      </GateLayout>
    );

    expect(screen.getAllByText('Coneshare')[0]).toBeInTheDocument();
    expect(screen.queryByText('Vault')).not.toBeInTheDocument();
    expect(screen.getByText('Secure File Share')).toBeInTheDocument();
    expect(screen.queryByText('SECURE PORTAL ACCESS')).not.toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Bob Manager')).toBeInTheDocument();
    expect(screen.getByText('About Coneshare')).toBeInTheDocument();
    const poweredByLink = screen.getByRole('link', { name: 'Coneshare' });
    expect(poweredByLink).toHaveAttribute('href', 'https://www.coneshare.com/');
  });

  it('renders custom badgeText when explicitly provided', () => {
    render(
      <GateLayout
        badgeText="CUSTOM NOTICE"
        publicMeta={{
          organization_name: 'Acme Global',
          target_type: 'document',
          target_name: 'Document.pdf',
          owner_name: 'Bob Manager',
        }}
      >
        <div>Simple Content</div>
      </GateLayout>
    );

    expect(screen.getByText('CUSTOM NOTICE')).toBeInTheDocument();
  });

  it('hides AccessOwnerCard when showAccessOwnerCard is false', () => {
    render(
      <GateLayout
        showAccessOwnerCard={false}
        publicMeta={{
          organization_name: 'Acme Global',
          target_type: 'document',
          target_name: 'Document.pdf',
          owner_name: 'Bob Manager',
        }}
      >
        <div>Simple Content</div>
      </GateLayout>
    );

    expect(screen.queryByText('Bob Manager')).not.toBeInTheDocument();
    expect(screen.getByText('Simple Content')).toBeInTheDocument();
  });

  it('renders safe resolved_brand_logo_url and ignores dangerous javascript: URLs', () => {
    const { rerender, container } = render(
      <GateLayout
        publicMeta={{
          organization_name: 'Acme Global',
          target_type: 'document',
          target_name: 'Document.pdf',
          resolved_brand_logo_url: 'https://cdn.example.com/logo.png',
        }}
      >
        <div>Content</div>
      </GateLayout>
    );

    const safeImages = container.querySelectorAll('img[src="https://cdn.example.com/logo.png"]');
    expect(safeImages.length).toBeGreaterThan(0);

    // XSS attempt with javascript: URL
    rerender(
      <GateLayout
        publicMeta={{
          organization_name: 'Acme Global',
          target_type: 'document',
          target_name: 'Document.pdf',
          resolved_brand_logo_url: 'javascript:alert(1)',
        }}
      >
        <div>Content</div>
      </GateLayout>
    );

    const dangerousImages = container.querySelectorAll('img[src="javascript:alert(1)"]');
    expect(dangerousImages.length).toBe(0);
  });

  it('does not render an h1 tag for the brand name, preserving semantic hierarchy for gate screens', () => {
    const { container } = render(
      <GateLayout
        publicMeta={{
          organization_name: 'Acme Global',
          target_type: 'document',
          target_name: 'Document.pdf',
        }}
      >
        <div>Content</div>
      </GateLayout>
    );

    // GateLayout should not have an h1 inside its header/card so gate views can provide the single h1
    const h1Elements = container.querySelectorAll('h1');
    expect(h1Elements.length).toBe(0);
  });
});
