import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { EmailForm } from '../../../components/viewer/EmailForm';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api');
vi.mock('sonner');

describe('EmailForm', () => {
  const mockOnSuccess = vi.fn();
  const slug = 'test-slug';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <EmailForm
        slug={slug}
        onSuccess={mockOnSuccess}
        publicMeta={{
          owner_name: 'Alice Owner',
          owner_email_masked: 'a***@example.com',
          target_type: 'dataroom',
          target_name: 'Deal Room',
        }}
      />
    );
  };

  it('renders the email form correctly', () => {
    renderComponent();
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('a***@example.com')).toBeInTheDocument();
    expect(screen.getByText('Deal Room')).toBeInTheDocument();
    expect(screen.getByText('This secure link requires email verification. Enter your email below to continue.')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('calls requestShareLinkAccess and onSuccess when verification is not required', async () => {
    api.requestShareLinkAccess.mockResolvedValue({
      data: { message: 'Access granted.', verification_required: false },
    });

    renderComponent();

    const emailInput = screen.getByLabelText(/email address/i);
    const submitButton = screen.getByRole('button', { name: /continue/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.requestShareLinkAccess).toHaveBeenCalledWith(slug, 'test@example.com');
    });

    expect(toast.success).toHaveBeenCalledWith('Access granted.');
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('shows "check your email" message when verification is required and allows changing email', async () => {
    api.requestShareLinkAccess.mockResolvedValue({
      data: {
        message: 'Verification link sent.',
        verification_required: true,
      },
    });

    renderComponent();

    const emailInput = screen.getByLabelText(/email address/i);
    const submitButton = screen.getByRole('button', { name: /continue/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    });

    expect(api.requestShareLinkAccess).toHaveBeenCalledWith(slug, 'test@example.com');
    expect(toast.success).toHaveBeenCalledWith('Verification link sent.');
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(screen.getByText(/a verification link has been sent to/i)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    // Click "Use a different email address"
    const switchButton = screen.getByRole('button', { name: /use a different email address/i });
    fireEvent.click(switchButton);

    // Should return to the email input form with Continue button enabled (not stuck in "Submitting")
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    const newSubmitButton = screen.getByRole('button', { name: /continue/i });
    expect(newSubmitButton).toBeInTheDocument();
    expect(newSubmitButton).toBeEnabled();
    expect(screen.queryByText(/submitting/i)).not.toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    api.requestShareLinkAccess.mockRejectedValue(new Error('API Error'));

    renderComponent();

    const emailInput = screen.getByLabelText(/email address/i);
    const submitButton = screen.getByRole('button', { name: /continue/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.requestShareLinkAccess).toHaveBeenCalledWith(slug, 'test@example.com');
      expect(submitButton).not.toBeDisabled();
    });

    // The global interceptor will show the toast, so we don't check for it here.
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('renders the confirmation view when requiresConfirmation is true', () => {
    render(
      <EmailForm
        slug={slug}
        onSuccess={mockOnSuccess}
        publicMeta={null}
        requiresConfirmation={true}
        emailToConfirm="confirm@example.com"
        token="my-token-123"
      />
    );

    expect(screen.getByText(/you are verifying access to this document as/i)).toBeInTheDocument();
    expect(screen.getByText('confirm@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use a different email address/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resend email/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/scanner safe/i)).not.toBeInTheDocument();
  });

  it('calls confirmShareLinkEmailAccess and onSuccess when clicking Continue', async () => {
    api.confirmShareLinkEmailAccess.mockResolvedValue({
      data: { message: 'Access granted successfully.' },
    });

    render(
      <EmailForm
        slug={slug}
        onSuccess={mockOnSuccess}
        publicMeta={null}
        requiresConfirmation={true}
        emailToConfirm="confirm@example.com"
        token="my-token-123"
      />
    );

    const confirmButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.confirmShareLinkEmailAccess).toHaveBeenCalledWith(slug, 'my-token-123');
    });

    expect(toast.success).toHaveBeenCalledWith('Access granted.');
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('renders organization brand logo when logo_mode is "org"', () => {
    render(
      <EmailForm
        slug={slug}
        onSuccess={mockOnSuccess}
        publicMeta={{
          owner_name: 'Alice Owner',
          logo_mode: 'org',
          resolved_brand_logo_url: 'https://example.com/org-logo.png',
        }}
      />
    );

    const logo = screen.getByRole('img', { name: /logo/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/org-logo.png');
  });

  it('renders custom dataroom logo when logo_mode is "dataroom"', () => {
    render(
      <EmailForm
        slug={slug}
        onSuccess={mockOnSuccess}
        publicMeta={{
          owner_name: 'Alice Owner',
          logo_mode: 'dataroom',
          resolved_brand_logo_url: 'https://example.com/custom-logo.png',
        }}
      />
    );

    const logo = screen.getByRole('img', { name: /logo/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/custom-logo.png');
  });

  it('returns to the email input form when confirmShareLinkEmailAccess fails with 403', async () => {
    api.confirmShareLinkEmailAccess.mockRejectedValue({
      response: {
        status: 403,
        data: { message: 'This email address is not authorized to access this link.' },
      },
    });

    render(
      <EmailForm
        slug={slug}
        onSuccess={mockOnSuccess}
        publicMeta={null}
        requiresConfirmation={true}
        emailToConfirm="removed@example.com"
        token="stale-token-123"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument();
    });
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});
