import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OAuthAuthorizePage from '../../pages/OAuthAuthorizePage';
import { oauthService } from '../../services/oauthService';
import '../../i18n';

vi.mock('../../services/oauthService');

describe('OAuthAuthorizePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const query =
    'client_id=cli_123&redirect_uri=https%3A%2F%2Fgemini.google.com%2Fcb&response_type=code&scope=documents%3Aread+documents%3Awrite&state=st_1&code_challenge=abc&code_challenge_method=S256';

  const renderPage = (onRedirect = vi.fn()) => {
    return render(
      <MemoryRouter initialEntries={[`/oauth/authorize?${query}`]}>
        <Routes>
          <Route
            path="/oauth/authorize"
            element={<OAuthAuthorizePage onRedirect={onRedirect} />}
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('loads consent metadata and submits approved scopes cleanly', async () => {
    const onRedirect = vi.fn();
    oauthService.getConsentDetails.mockResolvedValue({
      client_id: 'cli_123',
      application_name: 'Gemini Custom App',
      registration_source: 'dcr',
      redirect_uri: 'https://gemini.google.com/cb',
      scopes: [
        { name: 'documents:read', description: 'Read documents and folders in your workspace' },
        { name: 'documents:write', description: 'Create, update, and upload documents and folders' },
      ],
      state: 'st_1',
      user: { email: 'alice@example.com', name: 'Alice' },
    });
    oauthService.submitConsentDecision.mockResolvedValue({
      redirect_url: 'https://gemini.google.com/cb?code=auth_code_1&state=st_1',
    });

    renderPage(onRedirect);

    expect(await screen.findByText('Gemini Custom App')).toBeInTheDocument();
    expect(screen.getByText(/This application registered dynamically/i)).toBeInTheDocument();
    expect(screen.getByText(/Will redirect to https:\/\/gemini\.google\.com\/cb/i)).toBeInTheDocument();
    expect(screen.getByText(/alice@example\.com/i)).toBeInTheDocument();
    expect(screen.getByText('documents:read')).toBeInTheDocument();
    expect(screen.getByText('documents:write')).toBeInTheDocument();

    // Uncheck documents:write before approving
    fireEvent.click(screen.getByLabelText(/documents:write/i));
    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));

    await waitFor(() => {
      expect(oauthService.submitConsentDecision).toHaveBeenCalledWith({
        client_id: 'cli_123',
        redirect_uri: 'https://gemini.google.com/cb',
        response_type: 'code',
        scope: 'documents:read documents:write',
        state: 'st_1',
        code_challenge: 'abc',
        code_challenge_method: 'S256',
        allow: true,
        scopes: ['documents:read'],
      });
      expect(onRedirect).toHaveBeenCalledWith(
        'https://gemini.google.com/cb?code=auth_code_1&state=st_1'
      );
    });
  });

  it('submits deny decision and redirects with access_denied', async () => {
    const onRedirect = vi.fn();
    oauthService.getConsentDetails.mockResolvedValue({
      client_id: 'cli_123',
      application_name: 'Claude Web',
      registration_source: 'dcr',
      redirect_uri: 'https://claude.ai/cb',
      scopes: [{ name: 'documents:read', description: 'Read documents' }],
      user: { email: 'alice@example.com', name: 'Alice' },
    });
    oauthService.submitConsentDecision.mockResolvedValue({
      redirect_url: 'https://claude.ai/cb?error=access_denied&state=st_1',
    });

    renderPage(onRedirect);
    await screen.findByText('Claude Web');

    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));

    await waitFor(() => {
      expect(oauthService.submitConsentDecision).toHaveBeenCalledWith(
        expect.objectContaining({ allow: false })
      );
      expect(onRedirect).toHaveBeenCalledWith(
        'https://claude.ai/cb?error=access_denied&state=st_1'
      );
    });
  });

  it('shows validation error when OAuth request fails', async () => {
    oauthService.getConsentDetails.mockRejectedValue({
      response: { data: { error_description: 'PKCE with code_challenge_method=S256 is required.' } },
    });

    renderPage();

    expect(
      await screen.findByText('PKCE verification (S256) is required for authorization.')
    ).toBeInTheDocument();
  });

  it('shows localized error when redirect_url is missing or uses disallowed scheme', async () => {
    oauthService.getConsentDetails.mockResolvedValue({
      client_id: 'cli_123',
      application_name: 'Bad App',
      registration_source: 'manual',
      redirect_uri: 'https://gemini.google.com/cb',
      scopes: [{ name: 'documents:read', description: 'Read documents' }],
      user: { email: 'alice@example.com', name: 'Alice' },
    });
    oauthService.submitConsentDecision.mockResolvedValue({
      redirect_url: 'javascript:alert(1)',
    });

    renderPage();
    await screen.findByText('Bad App');
    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));

    expect(await screen.findByText('Disallowed redirect URI scheme.')).toBeInTheDocument();
  });
});
