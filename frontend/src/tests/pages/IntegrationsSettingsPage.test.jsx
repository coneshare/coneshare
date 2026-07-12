import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { IntegrationsSettingsPage } from '../../pages/IntegrationsSettingsPage';
import * as api from '../../services/api';

vi.mock('../../services/api');

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('IntegrationsSettingsPage', () => {
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    delete window.location;
    window.location = {
      href: 'http://localhost/settings/integrations',
      origin: 'http://localhost',
      pathname: '/settings/integrations',
      search: '',
      hash: '',
      assign: vi.fn(),
      replace: vi.fn(),
      reload: vi.fn(),
    };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('renders provider list and connection status correctly', async () => {
    api.getCloudProviders.mockResolvedValue({
      data: [
        { name: 'dropbox' },
        { name: 'google_drive' }
      ]
    });
    api.getCloudConnections.mockResolvedValue({
      data: [
        {
          id: 'conn_1',
          provider: 'dropbox',
          email: 'user@dropbox.com',
          created_at: '2026-07-01T12:00:00Z',
          updated_at: '2026-07-02T12:00:00Z'
        }
      ]
    });

    renderWithRouter(<IntegrationsSettingsPage />);

    expect(await screen.findByText('Dropbox')).toBeInTheDocument();
    expect(screen.getByText('Google Drive')).toBeInTheDocument();

    // Check connected/not connected state
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Not Connected')).toBeInTheDocument();
    expect(screen.getByText('user@dropbox.com')).toBeInTheDocument();
  });

  it('handles provider connection redirection on click', async () => {
    api.getCloudProviders.mockResolvedValue({ data: [{ name: 'google_drive' }] });
    api.getCloudConnections.mockResolvedValue({ data: [] });
    api.getGoogleDriveConnectUrl.mockResolvedValue({ data: { authorization_url: 'https://google.com/auth' } });

    renderWithRouter(<IntegrationsSettingsPage />);

    const connectBtn = await screen.findByRole('button', { name: /Connect Provider/i });
    fireEvent.click(connectBtn);

    await waitFor(() => {
      expect(api.getGoogleDriveConnectUrl).toHaveBeenCalled();
      expect(window.location.href).toBe('https://google.com/auth');
    });
  });

  it('opens confirmation modal and disconnects provider successfully', async () => {
    api.getCloudProviders.mockResolvedValue({
      data: [{ name: 'dropbox' }]
    });
    const connection = {
      id: 'conn_1',
      provider: 'dropbox',
      email: 'user@dropbox.com',
      created_at: '2026-07-01T12:00:00Z',
      updated_at: null
    };
    api.getCloudConnections.mockResolvedValue({
      data: [connection]
    });
    api.deleteCloudConnection.mockResolvedValue({});

    renderWithRouter(<IntegrationsSettingsPage />);

    const disconnectBtn = await screen.findByRole('button', { name: /Disconnect/i });
    fireEvent.click(disconnectBtn);

    // Confirmation modal should appear
    expect(screen.getByText('Disconnect Cloud Account?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /^Disconnect$/ });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteCloudConnection).toHaveBeenCalledWith('conn_1');
      expect(api.getCloudConnections).toHaveBeenCalledTimes(2); // Initial fetch + refresh
    });
  });
});
