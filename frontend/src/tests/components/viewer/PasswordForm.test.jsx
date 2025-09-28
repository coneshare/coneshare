import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordForm } from '../../../components/viewer/PasswordForm';
import * as api from '../../../services/api';

// Mock the API service
vi.mock('../../../services/api', () => ({
  verifyShareLinkPassword: vi.fn(),
}));

// Mock the toast library
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

describe('PasswordForm', () => {
  const mockOnSuccess = vi.fn();
  const slug = 'test-slug';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(<PasswordForm slug={slug} onSuccess={mockOnSuccess} />);
  };

  it('should render the form with all elements', () => {
    renderComponent();
    expect(screen.getByText('Password Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('should update password input on user typing', async () => {
    renderComponent();
    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'my-secret-password');
    expect(passwordInput).toHaveValue('my-secret-password');
  });

  it('should show loading state and call onSuccess on successful submission', async () => {
    api.verifyShareLinkPassword.mockResolvedValue({});
    renderComponent();

    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Continue' });

    await userEvent.type(passwordInput, 'correct-password');
    await userEvent.click(submitButton);

    expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();
    expect(api.verifyShareLinkPassword).toHaveBeenCalledWith(slug, 'correct-password');

    // Wait for the async actions to complete
    await vi.waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('should reset loading state on failed submission', async () => {
    api.verifyShareLinkPassword.mockRejectedValue(new Error('Invalid password'));
    renderComponent();

    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Continue' });

    await userEvent.type(passwordInput, 'wrong-password');
    await userEvent.click(submitButton);

    expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();
    expect(api.verifyShareLinkPassword).toHaveBeenCalledWith(slug, 'wrong-password');

    // Wait for the async actions to complete
    await vi.waitFor(() => {
      // The button should be enabled again
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });

    // onSuccess should not have been called
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});
