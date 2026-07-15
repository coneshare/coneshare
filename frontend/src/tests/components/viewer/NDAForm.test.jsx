import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NDAForm } from '../../../components/viewer/NDAForm';
import * as api from '../../../services/api';
import { toast } from 'sonner';

vi.mock('../../../services/api', () => ({
  acceptShareLinkNda: vi.fn(),
}));

vi.mock('../../../contexts/BrandingProvider', () => ({
  useBranding: () => ({
    brandName: 'Coneshare',
    brandLogoUrl: '/logo.svg',
    brandWebsiteUrl: 'https://www.coneshare.com',
    termsUrl: 'https://www.coneshare.com/terms',
    privacyPolicyUrl: 'https://www.coneshare.com/privacy',
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('NDAForm', () => {
  const defaultProps = {
    slug: 'test-slug',
    onSuccess: vi.fn(),
    publicMeta: {
      owner_name: 'Alice Owner',
      owner_avatar_url: '/avatar.png',
      target_name: 'Confidential Plan.pdf',
      target_type: 'document',
      nda_text: 'This is the confidential NDA text.',
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Clear URL search params
    window.history.replaceState({}, '', '/');
  });

  it('renders initial state correctly', () => {
    render(<NDAForm {...defaultProps} />);

    expect(screen.getByText('Coneshare')).toBeInTheDocument();
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('Confidential Plan.pdf')).toBeInTheDocument();
    expect(screen.getByText('This is the confidential NDA text.')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();

    const submitButton = screen.getByRole('button', { name: /accept & view document/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables and disables submit button based on checkbox', () => {
    render(<NDAForm {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    const submitButton = screen.getByRole('button', { name: /accept & view document/i });

    // Tick checkbox
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(submitButton).toBeEnabled();

    // Untick checkbox
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(submitButton).toBeDisabled();
  });

  it('submits form and calls acceptShareLinkNda API with query params', async () => {
    // Add view_session_id to query params
    window.history.replaceState({}, '', '?view_session_id=existing-session-123');

    api.acceptShareLinkNda.mockResolvedValue({
      data: { view_session_id: 'new-session-456' },
    });

    render(<NDAForm {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const submitButton = screen.getByRole('button', { name: /accept & view document/i });
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByText('Processing...')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.acceptShareLinkNda).toHaveBeenCalledWith('test-slug', {
        view_session_id: 'existing-session-123',
      });
      expect(toast.success).toHaveBeenCalledWith('NDA accepted successfully.');
      expect(defaultProps.onSuccess).toHaveBeenCalledWith('new-session-456');
    });
  });

  it('shows error toast on API failure and resets loading state', async () => {
    api.acceptShareLinkNda.mockRejectedValue({
      response: { data: { message: 'Invalid token or session expired.' } },
    });

    render(<NDAForm {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const submitButton = screen.getByRole('button', { name: /accept & view document/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid token or session expired.');
      expect(submitButton).toBeEnabled();
      expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
    });
  });

  it('adapts submit button label dynamically for datarooms', () => {
    const dataroomProps = {
      ...defaultProps,
      publicMeta: {
        ...defaultProps.publicMeta,
        target_type: 'dataroom',
      },
    };

    render(<NDAForm {...dataroomProps} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(screen.getByRole('button', { name: /accept & view dataroom/i })).toBeInTheDocument();
  });

  it('applies text wrap classes to scroll container', () => {
    render(<NDAForm {...defaultProps} />);

    const scrollBox = screen.getByText('This is the confidential NDA text.');
    expect(scrollBox.className).toContain('break-words');
    expect(scrollBox.className).toContain('overflow-x-hidden');
  });
});
