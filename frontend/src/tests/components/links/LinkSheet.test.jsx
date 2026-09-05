import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkSheet } from '../../../components/links/LinkSheet';
import * as api from '../../../services/api';
import { toast } from 'sonner';
import '../../../i18n';

// Mock ResizeObserver for Radix UI components in JSDOM
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

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
  const document = { id: 'doc_123' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onOpenChange: mockOnOpenChange,
      document,
      onSuccess: mockOnSuccess,
    };
    return render(<LinkSheet {...defaultProps} {...props} />);
  };

  describe('Create Mode', () => {
    it('should render the form for creating a new link', () => {
      renderComponent();
      expect(screen.getByText('Create New Link')).toBeInTheDocument();
      expect(screen.getByLabelText(/Name/)).toHaveValue('');
      expect(screen.getByLabelText(/Password protection/)).not.toBeChecked();
      expect(screen.getByLabelText(/Allow download/)).toBeChecked();
    });

    it('should call createShareLink with correct data when password is not enabled', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      await userEvent.type(screen.getByLabelText(/Name/), 'My New Link');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith(expect.objectContaining({
        document: document.id,
        name: 'My New Link',
      }));
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(toast.success).toHaveBeenCalledWith('Link created successfully.');
    });

    it('should call createShareLink with password when enabled', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      await userEvent.click(screen.getByLabelText(/Password protection/));
      await userEvent.type(screen.getByLabelText('Password'), 'secret123');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith(expect.objectContaining({
        document: document.id,
        password: 'secret123',
      }));
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
      expect(screen.getByLabelText(/Allow download/)).not.toBeChecked();
      expect(screen.getByLabelText(/Password protection/)).toBeChecked();
      expect(screen.getByLabelText('Password')).toHaveValue(''); // Password is not fetched back
    });

    it('should call updateShareLink without document id', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      await userEvent.clear(screen.getByLabelText(/Name/));
      await userEvent.type(screen.getByLabelText(/Name/), 'Updated Name');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, expect.objectContaining({
        name: 'Updated Name',
      }));
      const payload = api.updateShareLink.mock.calls[0][1];
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('document');
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Link updated successfully.');
    });

    it('should call updateShareLink with new password if changed', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      const passwordInput = screen.getByLabelText('Password');
      await userEvent.type(passwordInput, 'new-secret');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, expect.objectContaining({
        password: 'new-secret',
      }));
      expect(api.updateShareLink.mock.calls[0][1]).not.toHaveProperty('document');
    });

    it('should call updateShareLink with an empty password to remove it', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      // Simulate enabling, then clearing the password
      await userEvent.type(screen.getByLabelText('Password'), 'any');
      await userEvent.clear(screen.getByLabelText('Password'));
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, expect.objectContaining({
        password: '',
      }));
      expect(api.updateShareLink.mock.calls[0][1]).not.toHaveProperty('document');
    });

    it('should call updateShareLink with an empty password if protection is disabled', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ currentLink });

      await userEvent.click(screen.getByLabelText(/Password protection/)); // Toggle it off
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith(currentLink.id, expect.objectContaining({
        password: '',
      }));
      expect(api.updateShareLink.mock.calls[0][1]).not.toHaveProperty('document');
    });
  });

  describe('Dataroom Mode', () => {
    const dataroom = { id: 'dr_456' };

    it('should call createShareLink with dataroom id', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent({ document: null, dataroom: dataroom }); // override document

      await userEvent.type(screen.getByLabelText(/Name/), 'My Dataroom Link');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith(expect.objectContaining({
        dataroom: dataroom.id,
      }));
      expect(api.createShareLink.mock.calls[0][0]).not.toHaveProperty('document');
    });

    it('should call updateShareLink for a dataroom link and not send dataroom id', async () => {
      const currentLink = {
        id: 'link_xyz',
        name: 'Existing Dataroom Link',
        allow_download: true,
        has_password: false,
      };
      api.updateShareLink.mockResolvedValue({});
      renderComponent({ document: null, dataroom: dataroom, currentLink });

      await userEvent.click(screen.getByLabelText(/Password protection/));
      await userEvent.type(screen.getByLabelText('Password'), 'newpass');
      await userEvent.click(screen.getByText('Save Changes'));

      const payload = api.updateShareLink.mock.calls[0][1];
      expect(api.updateShareLink).toHaveBeenCalledWith('link_xyz', expect.objectContaining({
        password: 'newpass',
      }));
      expect(payload).not.toHaveProperty('dataroom');
      expect(payload).not.toHaveProperty('document');
    });

    it('should omit enable_qna when the dataroom has Q&A disabled', async () => {
      const currentLink = {
        id: 'link_qna',
        name: 'Existing Dataroom Link',
        allow_download: true,
        has_password: false,
        enable_qna: true,
      };
      api.updateShareLink.mockResolvedValue({});
      renderComponent({
        document: null,
        dataroom: { ...dataroom, enable_qna: false },
        currentLink,
      });

      await userEvent.clear(screen.getByLabelText(/Name/));
      await userEvent.type(screen.getByLabelText(/Name/), 'Renamed Link');
      await userEvent.click(screen.getByText('Save Changes'));

      const payload = api.updateShareLink.mock.calls[0][1];
      expect(payload).not.toHaveProperty('enable_qna');
      expect(payload.name).toBe('Renamed Link');
    });

    it('should send enable_qna when the dataroom has Q&A enabled', async () => {
      const currentLink = {
        id: 'link_qna',
        name: 'Existing Dataroom Link',
        allow_download: true,
        has_password: false,
        enable_qna: false,
      };
      api.updateShareLink.mockResolvedValue({});
      renderComponent({
        document: null,
        dataroom: { ...dataroom, enable_qna: true },
        currentLink,
      });

      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith('link_qna', expect.objectContaining({
        enable_qna: false,
      }));
    });
  });
});
