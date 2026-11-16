import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import OAuthAuthorizePage from '../../pages/OAuthAuthorizePage';
import { oauthService } from '../../services/oauthService';
import '../../i18n';

vi.mock('../../services/oauthService');

describe('OAuthAuthorizePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const query =
    'client_id=cli_123&redirect_uri=https%3A%2F%2Fgemini.google.com%2Fcb&response_type=code&scope=read+write&state=st_1&code_challenge=abc&code_challenge_method=S256';

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
        { name: 'read', description: 'Read documents, folders, datarooms, and share links' },
        { name: 'write', description: 'Create, update, and share documents, folders, and datarooms' },
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
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();

    // Uncheck write before approving
    fireEvent.click(screen.getByLabelText(/write/i));
    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));

    await waitFor(() => {
      expect(oauthService.submitConsentDecision).toHaveBeenCalledWith({
        client_id: 'cli_123',
        redirect_uri: 'https://gemini.google.com/cb',
        response_type: 'code',
        scope: 'read write',
        state: 'st_1',
        code_challenge: 'abc',
        code_challenge_method: 'S256',
        allow: true,
        scopes: ['read'],
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
      scopes: [{ name: 'read', description: 'Read workspace' }],
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
      scopes: [{ name: 'read', description: 'Read workspace' }],
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

  it('clears prior consent data when navigating to a new request that fails to load', async () => {
    const queryB =
      'client_id=cli_other&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&response_type=code&scope=write&state=st_2&code_challenge=def&code_challenge_method=S256';

    oauthService.getConsentDetails
      .mockResolvedValueOnce({
        client_id: 'cli_123',
        application_name: 'Client A',
        registration_source: 'dcr',
        redirect_uri: 'https://gemini.google.com/cb',
        scopes: [{ name: 'read', description: 'Read workspace' }],
        user: { email: 'alice@example.com', name: 'Alice' },
      })
      .mockRejectedValueOnce({
        response: { data: { error_description: 'PKCE with code_challenge_method=S256 is required.' } },
      });

    function NavigationHarness() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate(`/oauth/authorize?${queryB}`)}>
            Switch Request
          </button>
          <OAuthAuthorizePage onRedirect={vi.fn()} />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={[`/oauth/authorize?${query}`]}>
        <Routes>
          <Route path="/oauth/authorize" element={<NavigationHarness />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Client A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Authorize/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Switch Request' }));

    expect(
      await screen.findByText('PKCE verification (S256) is required for authorization.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Client A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authorize/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deny/i })).not.toBeInTheDocument();
    expect(oauthService.submitConsentDecision).not.toHaveBeenCalled();
  });

  it('preserves repeated resource query parameters across GET and POST', async () => {
    const onRedirect = vi.fn();
    oauthService.getConsentDetails.mockResolvedValue({
      client_id: 'cli_123',
      application_name: 'Resource App',
      registration_source: 'dcr',
      redirect_uri: 'https://gemini.google.com/cb',
      scopes: [{ name: 'read', description: 'Read workspace' }],
      user: { email: 'alice@example.com', name: 'Alice' },
    });
    oauthService.submitConsentDecision.mockResolvedValue({
      redirect_url: 'https://gemini.google.com/cb?code=auth_code_2&state=st_1',
    });

    const multiResourceQuery = `${query}&resource=${encodeURIComponent('https://mcp.example/mcp')}&resource=not-a-uri`;
    render(
      <MemoryRouter initialEntries={[`/oauth/authorize?${multiResourceQuery}`]}>
        <Routes>
          <Route
            path="/oauth/authorize"
            element={<OAuthAuthorizePage onRedirect={onRedirect} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Resource App');
    expect(oauthService.getConsentDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: ['https://mcp.example/mcp', 'not-a-uri'],
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));

    await waitFor(() => {
      expect(oauthService.submitConsentDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: ['https://mcp.example/mcp', 'not-a-uri'],
          allow: true,
        })
      );
    });
  });

  it('ignores delayed POST completions from an earlier request after query navigation', async () => {
    const onRedirect = vi.fn();
    const queryB =
      'client_id=cli_other&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&response_type=code&scope=write&state=st_2&code_challenge=def&code_challenge_method=S256';

    let resolvePostA;
    let rejectPostA;
    oauthService.getConsentDetails
      .mockResolvedValueOnce({
        client_id: 'cli_123',
        application_name: 'Client A',
        registration_source: 'dcr',
        redirect_uri: 'https://gemini.google.com/cb',
        scopes: [{ name: 'read', description: 'Read workspace' }],
        user: { email: 'alice@example.com', name: 'Alice' },
      })
      .mockResolvedValueOnce({
        client_id: 'cli_other',
        application_name: 'Client B',
        registration_source: 'dcr',
        redirect_uri: 'https://claude.ai/cb',
        scopes: [{ name: 'write', description: 'Write workspace' }],
        user: { email: 'alice@example.com', name: 'Alice' },
      })
      .mockResolvedValueOnce({
        client_id: 'cli_123',
        application_name: 'Client A Retry',
        registration_source: 'dcr',
        redirect_uri: 'https://gemini.google.com/cb',
        scopes: [{ name: 'read', description: 'Read workspace' }],
        user: { email: 'alice@example.com', name: 'Alice' },
      });

    oauthService.submitConsentDecision
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePostA = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPostA = reject;
          })
      );

    function NavigationHarness() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate(`/oauth/authorize?${queryB}`)}>
            Go B
          </button>
          <button type="button" onClick={() => navigate(`/oauth/authorize?${query}`)}>
            Go A
          </button>
          <OAuthAuthorizePage onRedirect={onRedirect} />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={[`/oauth/authorize?${query}`]}>
        <Routes>
          <Route path="/oauth/authorize" element={<NavigationHarness />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Client A')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));

    // Navigate to request B while request A's POST is still pending
    fireEvent.click(screen.getByRole('button', { name: 'Go B' }));
    expect(await screen.findByText('Client B')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Authorize/i })).toBeEnabled();

    // Resolving stale POST A must not trigger redirect for B
    resolvePostA({ redirect_url: 'https://gemini.google.com/cb?code=stale_code' });
    await waitFor(() => {
      expect(onRedirect).not.toHaveBeenCalled();
    });

    // Submit on B, then navigate back to A before B's POST rejects
    fireEvent.click(screen.getByRole('button', { name: /Authorize/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Go A' }));
    expect(await screen.findByText('Client A Retry')).toBeInTheDocument();

    rejectPostA({
      response: { data: { error_description: 'PKCE with code_challenge_method=S256 is required.' } },
    });
    await waitFor(() => {
      expect(
        screen.queryByText('PKCE verification (S256) is required for authorization.')
      ).not.toBeInTheDocument();
    });
  });
});
