import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ShareLinkViewerPage } from '../../pages/ShareLinkViewerPage';
import * as api from '../../services/api';

vi.mock('../../services/api');

// Mock child components to isolate the page component
vi.mock('../../components/viewer/PasswordForm', () => ({
  PasswordForm: ({ onSuccess }) => (
    <div>
      <span>Password Form</span>
      <button onClick={onSuccess}>Submit Password</button>
    </div>
  ),
}));

vi.mock('../../components/viewer/EmailForm', () => ({
  EmailForm: ({ onSuccess }) => (
    <div>
      <span>Email Form</span>
      <button onClick={onSuccess}>Submit Email</button>
    </div>
  ),
}));

vi.mock('../../components/documents/PreviewViewer', () => ({
  PreviewViewer: () => <div>Preview Viewer</div>,
}));

vi.mock('../../components/viewer/ViewerToolbar', () => ({
  ViewerToolbar: () => <div>Viewer Toolbar</div>,
}));

describe('ShareLinkViewerPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockDocumentData = {
    id: 'doc_123',
    name: 'Test Document',
    num_pages: 3,
    pages: [{ page_number: 1, url: '/page1.png' }],
    link_settings: { id: 'link_abc', allow_download: true },
  };

  const mockViewData = {
    id: 'view_123',
  };

  const renderComponent = (route) => {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/view/:slug" element={<ShareLinkViewerPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('shows loading state initially', () => {
    api.getShareLinkViewData.mockReturnValue(new Promise(() => {})); // Never resolves
    renderComponent('/view/test-slug');
    // Find skeletons by checking for the animation class
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message on API failure', async () => {
    api.getShareLinkViewData.mockRejectedValue({
      response: { data: { message: 'This link is expired.' } },
    });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
    expect(screen.getByText('This link is expired.')).toBeInTheDocument();
  });

  it('renders PasswordForm when protectionType is password', async () => {
    api.getShareLinkViewData.mockRejectedValue({
      response: { status: 401, data: { protectionType: 'password' } },
    });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Password Form')).toBeInTheDocument();
    });
  });

  it('renders EmailForm when protectionType is email', async () => {
    api.getShareLinkViewData.mockRejectedValue({
      response: { status: 401, data: { protectionType: 'email' } },
    });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Email Form')).toBeInTheDocument();
    });
  });

  it('fetches data again after successful password submission', async () => {
    // Initial load fails with password protection
    api.getShareLinkViewData.mockRejectedValueOnce({
      response: { status: 401, data: { protectionType: 'password' } },
    });

    // Second load (after password) succeeds
    api.getShareLinkViewData.mockResolvedValueOnce({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Password Form')).toBeInTheDocument();
    });

    // Simulate successful password submission
    const submitButton = screen.getByRole('button', { name: /submit password/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Preview Viewer')).toBeInTheDocument();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(2);
  });

  it('fetches data successfully and renders the viewer', async () => {
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Preview Viewer')).toBeInTheDocument();
    });
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', null, null);
    expect(api.createViewSession).toHaveBeenCalledWith({ share_link: 'link_abc' });
  });

  it('passes accessToken from URL to API call', async () => {
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug?accessToken=my-secret-token');

    await waitFor(() => {
      expect(screen.getByText('Preview Viewer')).toBeInTheDocument();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', null, 'my-secret-token');
  });
});
