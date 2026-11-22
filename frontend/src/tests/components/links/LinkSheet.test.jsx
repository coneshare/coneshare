import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkSheet } from '../../../components/links/LinkSheet';
import * as api from '../../../services/api';
import { toast } from 'sonner';
import '../../../i18n';

// Mock ResizeObserver for Radix UI components in JSDOM
const ResizeObserverMock = vi.fn(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});
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

  describe('Email Allowlist & Advanced Settings', () => {
    it('keeps advanced settings collapsed by default in create mode and shows active count badge', async () => {
      renderComponent();

      const advancedButton = screen.getByRole('button', { name: /Advanced settings/i });
      expect(advancedButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText('1 active')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Who can access/)).not.toBeInTheDocument();

      await userEvent.click(advancedButton);
      expect(advancedButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByLabelText(/Who can access/)).toBeInTheDocument();

      await userEvent.selectOptions(screen.getByLabelText(/Who can access/), 'allowlist');
      expect(screen.getByText('2 active')).toBeInTheDocument();
    });

    it('keeps advanced settings collapsed in edit mode when no advanced options are active', () => {
      renderComponent({
        currentLink: {
          id: 'link_basic',
          name: 'Basic Link',
          allow_download: true,
          enable_qna: true,
          require_nda: false,
          enable_watermark: false,
          audience_mode: 'anyone',
        },
      });

      const advancedButton = screen.getByRole('button', { name: /Advanced settings/i });
      expect(advancedButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByLabelText(/Who can access/)).not.toBeInTheDocument();
    });

    it('locks require email, defaults email verification, and parses newline and comma entries', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      await userEvent.click(screen.getByRole('button', { name: /Advanced settings/i }));

      const audienceSelect = screen.getByLabelText(/Who can access/);
      await userEvent.selectOptions(audienceSelect, 'allowlist');

      const requireEmailSwitch = screen.getByLabelText(/Require email to view/);
      const verifyEmailSwitch = screen.getByLabelText(/Verify email to view/);
      expect(requireEmailSwitch).toBeChecked();
      expect(requireEmailSwitch).toBeDisabled();
      expect(verifyEmailSwitch).toBeChecked();

      const textarea = screen.getByLabelText(/Allowed emails or domains/);
      await userEvent.type(textarea, 'alice@company.com, @partner.com\n*@eu.partner.com');

      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith(expect.objectContaining({
        audience_mode: 'allowlist',
        audience_emails: ['alice@company.com', '@partner.com', '*@eu.partner.com'],
        requires_email: true,
        requires_email_verification: true,
      }));
    });

    it('shows a warning when verification is turned off for an allowlist link', async () => {
      renderComponent();

      await userEvent.click(screen.getByRole('button', { name: /Advanced settings/i }));
      await userEvent.selectOptions(screen.getByLabelText(/Who can access/), 'allowlist');
      await userEvent.click(screen.getByLabelText(/Verify email to view/));

      expect(
        screen.getByText(/Email verification is off/i)
      ).toBeInTheDocument();
    });

    it('auto-expands advanced settings and hydrates existing allowlist settings in edit mode', async () => {
      api.updateShareLink.mockResolvedValue({});
      renderComponent({
        currentLink: {
          id: 'link_allowlist',
          name: 'Investor Room',
          allow_download: true,
          requires_email: true,
          requires_email_verification: true,
          audience_mode: 'allowlist',
          audience_emails: ['alice@company.com', '*@lpfirm.com'],
        },
      });

      expect(screen.getByRole('button', { name: /Advanced settings/i })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(screen.getByText('2 active')).toBeInTheDocument();
      expect(screen.getByLabelText(/Who can access/)).toHaveValue('allowlist');
      expect(screen.getByLabelText(/Allowed emails or domains/)).toHaveValue(
        'alice@company.com\n*@lpfirm.com'
      );

      await userEvent.selectOptions(screen.getByLabelText(/Who can access/), 'anyone');
      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.updateShareLink).toHaveBeenCalledWith('link_allowlist', expect.objectContaining({
        audience_mode: 'anyone',
        audience_emails: [],
      }));
    });

    it('reopens advanced settings and shows validation error when NDA is enabled with empty terms while collapsed', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      const advancedButton = screen.getByRole('button', { name: /Advanced settings/i });
      await userEvent.click(advancedButton);
      await userEvent.click(screen.getByLabelText(/Require NDA/));

      // Collapse Advanced settings with empty NDA terms
      await userEvent.click(advancedButton);
      expect(advancedButton).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).not.toHaveBeenCalled();
      expect(advancedButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter NDA terms before saving.');
    });

    it('allows saving valid NDA settings while advanced settings is collapsed', async () => {
      api.createShareLink.mockResolvedValue({});
      renderComponent();

      const advancedButton = screen.getByRole('button', { name: /Advanced settings/i });
      await userEvent.click(advancedButton);
      await userEvent.click(screen.getByLabelText(/Require NDA/));
      await userEvent.type(screen.getByLabelText(/NDA Terms/), 'Standard NDA Terms');

      await userEvent.click(advancedButton);
      expect(advancedButton).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(screen.getByText('Save Changes'));

      expect(api.createShareLink).toHaveBeenCalledWith(expect.objectContaining({
        require_nda: true,
        nda_text: 'Standard NDA Terms',
      }));
    });
  });
});
