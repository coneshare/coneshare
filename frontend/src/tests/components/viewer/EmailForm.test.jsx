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
    return render(<EmailForm slug={slug} onSuccess={mockOnSuccess} />);
  };

  it('renders the email form correctly', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /email required/i })).toBeInTheDocument();
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
    });

    // The global interceptor will show the toast, so we don't check for it here.
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(submitButton).not.toBeDisabled();
  });
});
