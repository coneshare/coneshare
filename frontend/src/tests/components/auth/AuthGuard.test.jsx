import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuthGuard from '../../../components/auth/AuthGuard';

function LoginLocationTracker() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="login-page">Login Page</span>
      <span data-testid="from-pathname">{location.state?.from?.pathname}</span>
      <span data-testid="from-search">{location.state?.from?.search}</span>
    </div>
  );
}

describe('AuthGuard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderWithRouter = (initialEntry = '/protected') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginLocationTracker />} />
          <Route element={<AuthGuard />}>
            <Route path="/auth/:providerName/callback" element={<div>OAuth Callback Processing</div>} />
            <Route path="/protected" element={<div>Protected Dashboard Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  };

  it('redirects to /login and preserves location when unauthenticated (no tokens)', () => {
    renderWithRouter('/protected?tab=settings');

    expect(screen.queryByText('Protected Dashboard Content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('from-pathname')).toHaveTextContent('/protected');
    expect(screen.getByTestId('from-search')).toHaveTextContent('?tab=settings');
  });

  it('redirects unauthenticated OAuth callback route to /login and preserves callback params', () => {
    renderWithRouter('/auth/dropbox/callback?code=oauth123&state=state456');

    expect(screen.queryByText('OAuth Callback Processing')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('from-pathname')).toHaveTextContent('/auth/dropbox/callback');
    expect(screen.getByTestId('from-search')).toHaveTextContent('?code=oauth123&state=state456');
  });

  it('renders child outlet when access_token is present in localStorage', () => {
    localStorage.setItem('access_token', 'valid_access_token');

    renderWithRouter('/protected');

    expect(screen.getByText('Protected Dashboard Content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('renders child outlet when only refresh_token is present in localStorage', () => {
    localStorage.setItem('refresh_token', 'valid_refresh_token');

    renderWithRouter('/protected');

    expect(screen.getByText('Protected Dashboard Content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});
