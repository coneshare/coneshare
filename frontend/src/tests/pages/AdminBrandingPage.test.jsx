import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminBrandingPage } from '../../pages/AdminBrandingPage';
import * as api from '../../services/api';
import { toast } from 'sonner';
import appI18n from '../../i18n';

const mockRefetchBranding = vi.fn();

vi.mock('../../services/api', () => ({
  getAdminBranding: vi.fn(),
  updateAdminBranding: vi.fn(),
}));

vi.mock('../../contexts/BrandingProvider', () => ({
  useBranding: () => ({
    brandName: 'Coneshare',
    brandLogoUrl: '/logo.svg',
    brandWebsiteUrl: '',
    refetchBranding: mockRefetchBranding,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminBrandingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders existing branding parameters and submits form updates', async () => {
    api.getAdminBranding.mockResolvedValue({
      data: {
        id: 'org-123',
        name: 'Default Organization',
        brand_name: 'Acme Portal',
        brand_logo_url: 'https://cdn.acme.com/logo.png',
        brand_website_url: 'https://acme.com',
        terms_url: 'https://acme.com/terms',
        privacy_policy_url: 'https://acme.com/privacy',
      },
    });

    api.updateAdminBranding.mockResolvedValue({
      data: {
        brand_name: 'Acme Updated Portal',
        brand_website_url: 'https://acme.com/updated',
        terms_url: 'https://acme.com/terms/updated',
        privacy_policy_url: 'https://acme.com/privacy/updated',
      },
    });

    render(
      <MemoryRouter>
        <AdminBrandingPage />
      </MemoryRouter>
    );

    // Assert branding loads
    const nameInput = await screen.findByLabelText(/Brand Name/i);
    expect(nameInput.value).toBe('Acme Portal');

    const urlInput = screen.getByLabelText(/Brand Website URL/i);
    expect(urlInput.value).toBe('https://acme.com');

    const termsInput = screen.getByLabelText(/Terms of Service URL/i);
    expect(termsInput.value).toBe('https://acme.com/terms');

    const privacyInput = screen.getByLabelText(/Privacy Policy URL/i);
    expect(privacyInput.value).toBe('https://acme.com/privacy');

    // Change fields
    fireEvent.change(nameInput, { target: { value: 'Acme Updated Portal' } });
    fireEvent.change(urlInput, { target: { value: 'https://acme.com/updated' } });
    fireEvent.change(termsInput, { target: { value: 'https://acme.com/terms/updated' } });
    fireEvent.change(privacyInput, { target: { value: 'https://acme.com/privacy/updated' } });

    // Submit form
    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateAdminBranding).toHaveBeenCalled();
      expect(mockRefetchBranding).toHaveBeenCalled();
    });
  });

  it('displays detailed error message when save fails with validation errors', async () => {
    api.getAdminBranding.mockResolvedValue({
      data: {
        id: 'org-123',
        brand_name: 'Acme Portal',
      },
    });

    const mockError = new Error('Request failed');
    mockError.response = {
      data: {
        brand_logo: ['Upload a valid image. The file you uploaded was either not an image or a corrupted image.'],
      },
    };
    api.updateAdminBranding.mockRejectedValue(mockError);

    render(
      <MemoryRouter>
        <AdminBrandingPage />
      </MemoryRouter>
    );

    // Trigger save by changing name
    const nameInput = await screen.findByLabelText(/Brand Name/i);
    fireEvent.change(nameInput, { target: { value: 'Acme Updated Portal' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateAdminBranding).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        'Brand logo: Upload a valid image. The file you uploaded was either not an image or a corrupted image.'
      );
    });
  });

  it('renders Brand Customization heading and Pro notice card linking to pricing without a toggle switch', async () => {
    api.getAdminBranding.mockResolvedValue({
      data: {
        id: 'org-123',
        brand_name: 'Acme Portal',
      },
    });

    render(
      <MemoryRouter>
        <AdminBrandingPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Brand Customization' })).toBeInTheDocument();
    expect(screen.queryByText(/White-Labeling/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    expect(screen.getByText('Remove "Powered by Coneshare" Branding')).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Coneshare Pro to remove it automatically\./i)).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();

    const pricingLink = screen.getByRole('link', { name: /view pricing/i });
    expect(pricingLink).toHaveAttribute('href', 'https://www.coneshare.com/pricing');
    expect(pricingLink).toHaveAttribute('target', '_blank');
    expect(pricingLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('links View pricing to Chinese pricing page when language is zh-hans', async () => {
    api.getAdminBranding.mockResolvedValue({
      data: {
        id: 'org-123',
        brand_name: 'Acme Portal',
      },
    });

    const previousLang = appI18n.language;
    await appI18n.changeLanguage('zh-hans');

    try {
      const { unmount } = render(
        <MemoryRouter>
          <AdminBrandingPage />
        </MemoryRouter>
      );

      const pricingLink = await screen.findByRole('link', { name: /查看定价方案/i });
      expect(pricingLink).toHaveAttribute('href', 'https://www.coneshare.com/zh/pricing');
      unmount();
    } finally {
      await appI18n.changeLanguage(previousLang);
    }
  });
});
