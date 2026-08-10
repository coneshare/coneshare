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

  it('shows "check your email" message when verification is required', async () => {
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
    expect(screen.getByRole('button', { name: /continue to document/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use a different email address/i })).toBeInTheDocument();
  });

  it('calls confirmShareLinkEmailAccess and onSuccess when clicking Continue to Document', async () => {
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

    const confirmButton = screen.getByRole('button', { name: /continue to document/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.confirmShareLinkEmailAccess).toHaveBeenCalledWith(slug, 'my-token-123');
    });

    expect(toast.success).toHaveBeenCalledWith('Access granted successfully.');
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('switches to normal email input view when clicking Use a different email address', async () => {
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

    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();

    const switchButton = screen.getByRole('button', { name: /use a different email address/i });
    fireEvent.click(switchButton);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});
