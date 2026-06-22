import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { EmailForm } from '../../../components/viewer/EmailForm';
import * as api from '../../../services/api';

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
    expect(screen.getByText('Alice Owner (a***@example.com) invited you to the dataroom "Deal Room"')).toBeInTheDocument();
    expect(screen.getByText('Please enter your email address to continue.')).toBeInTheDocument();
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

  it('shows verification code input and verifies successfully when code is entered', async () => {
    api.requestShareLinkAccess.mockResolvedValue({
      data: {
        message: 'Verification code sent.',
        verification_required: true,
      },
    });
    api.verifyShareLinkCode.mockResolvedValue({
      data: { message: 'Email verified successfully.' },
    });

    renderComponent();

    const emailInput = screen.getByLabelText(/email address/i);
    const submitButton = screen.getByRole('button', { name: /continue/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/a 6-digit verification code has been sent to/i)).toBeInTheDocument();
    });

    expect(api.requestShareLinkAccess).toHaveBeenCalledWith(slug, 'test@example.com');
    expect(toast.success).toHaveBeenCalledWith('Verification code sent.');
    expect(screen.getByText(/a 6-digit verification code has been sent to/i)).toBeInTheDocument();

    const codeInput = screen.getByLabelText(/verification code/i);
    const verifyButton = screen.getByRole('button', { name: /verify/i });

    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(api.verifyShareLinkCode).toHaveBeenCalledWith(slug, 'test@example.com', '123456');
    });

    expect(toast.success).toHaveBeenCalledWith('Email verified successfully.');
    expect(mockOnSuccess).toHaveBeenCalled();
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
    });

    // The global interceptor will show the toast, so we don't check for it here.
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(submitButton).not.toBeDisabled();
  });

  it('shows fallback heading when publicMeta is unavailable', () => {
    render(<EmailForm slug={slug} onSuccess={mockOnSuccess} publicMeta={null} />);
    expect(screen.getByRole('heading', { name: 'Email Required' })).toBeInTheDocument();
  });
});
