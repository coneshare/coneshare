import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkSheet } from '../../../components/links/LinkSheet';
import * as api from '../../../services/api';

// Mock the API service
vi.mock('../../../services/api', () => ({
  createShareLink: vi.fn(),
  updateShareLink: vi.fn(),
}));

// Mock the toast library
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

describe('LinkSheet', () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const documentId = 'doc_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onOpenChange: mockOnOpenChange,
      documentId,
      onSuccess: mockOnSuccess,
    };
    return render(<LinkSheet {...defaultProps} {...props} />);
  };

  describe('Create Mode', () => {
    it('should render the form for creating a new link', () => {
      renderComponent();
      expect(screen.getByText('Create New Link')).toBeInTheDocument();
      expect(screen.getByLabelText(/Name/)).toHaveValue('');
      expect(screen.getByLabelText(/Password Protection/)).not.toBeChecked();
      expect(screen.getByLabelText(/Allow Download/)).toBeChecked();
    });

    it('should call createShareLink with correct data when password is not enabled', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      await userEvent.type(screen.getByLabelText(/Name/), 'My New Link');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith({
        document: documentId,
        name: 'My New Link',
        allow_download: true,
      });
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call createShareLink with password when enabled', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      await userEvent.click(screen.getByLabelText(/Password Protection/));
      await userEvent.type(screen.getByLabelText('Password'), 'secret123');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith({
        document: documentId,
        name: '',
        allow_download: true,
        password: 'secret123',
      });
    });
  });

  describe('Edit Mode', () => {
    const currentLink = {
      id: 'link_abc',
      name: 'Existing Link',
      allow_download: false,
      has_password: true,
    };

    it('should render the form pre-filled for an existing link with a password', () => {
      renderComponent({ currentLink });

      expect(screen.getByText('Edit Link')).toBeInTheDocument();
      expect(screen.getByLabelText(/Name/)).toHaveValue('Existing Link');
      expect(screen.getByLabelText(/Allow Download/)).not.toBeChecked();
      expect(screen.getByLabelText(/Password Protection/)).toBeChecked();
      expect(screen.getByLabelText('Password')).toHaveValue('●●●●●●●●');
    });

    it('should call updateShareLink without password if not changed', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      await userEvent.clear(screen.getByLabelText(/Name/));
      await userEvent.type(screen.getByLabelText(/Name/), 'Updated Name');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, {
        document: documentId,
        name: 'Updated Name',
        allow_download: false,
      });
      expect(api.updateShareLink.mock.calls[0][1]).not.toHaveProperty('password');
      expect(mockOnSuccess).toHaveBeenCalled();
    });

    it('should call updateShareLink with new password if changed', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      const passwordInput = screen.getByLabelText('Password');
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'new-secret');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, {
        document: documentId,
        name: 'Existing Link',
        allow_download: false,
        password: 'new-secret',
      });
    });

    it('should call updateShareLink with an empty password to remove it', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      await userEvent.clear(screen.getByLabelText('Password'));
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, {
        document: documentId,
        name: 'Existing Link',
        allow_download: false,
        password: '',
      });
    });

    it('should call updateShareLink with an empty password if protection is disabled', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      await userEvent.click(screen.getByLabelText(/Password Protection/)); // Toggle it off
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, {
        document: documentId,
        name: 'Existing Link',
        allow_download: false,
        password: '',
      });
    });
  });
});
