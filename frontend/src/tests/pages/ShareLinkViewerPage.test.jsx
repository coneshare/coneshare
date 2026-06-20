globalThis.DOMMatrix = class DOMMatrix {};

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ShareLinkViewerPage } from '../../pages/ShareLinkViewerPage';
import * as api from '../../services/api';

vi.mock('../../services/api');

// Mock child components to isolate the page component
vi.mock('../../components/viewer/PasswordForm', () => ({
  PasswordForm: ({ onSuccess, publicMeta }) => (
    <div>
      <span>Password Form</span>
      <span>{publicMeta?.owner_name || ''}</span>
      <button onClick={onSuccess}>Submit Password</button>
    </div>
  ),
}));

vi.mock('../../components/viewer/EmailForm', () => ({
  EmailForm: ({ onSuccess, publicMeta }) => (
    <div>
      <span>Email Form</span>
      <span>{publicMeta?.owner_name || ''}</span>
      <button onClick={onSuccess}>Submit Email</button>
    </div>
  ),
}));

vi.mock('../../components/documents/PreviewViewer', () => ({
  PreviewViewer: () => <div>Preview Viewer</div>,
}));

vi.mock('../../components/documents/PdfJsViewer', () => ({
  PdfJsViewer: () => <div>PdfJs Viewer</div>,
}));

vi.mock('../../components/viewer/ViewerToolbar', () => ({
  ViewerToolbar: () => <div>Viewer Toolbar</div>,
}));

vi.mock('../../components/viewer/QnAPanel', () => ({
  QnAPanel: ({ open, dataroomDocumentId, contextLabel }) => (
    <div data-testid="qna-panel">
      {open ? 'Q&A Open' : 'Q&A Closed'}
      <span>{dataroomDocumentId || 'document-context'}</span>
      <span>{contextLabel}</span>
    </div>
  ),
}));

describe('ShareLinkViewerPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    api.getPublicQnaSummary.mockResolvedValue({ data: { thread_count: 0 } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockDocumentData = {
    id: 'doc_123',
    name: 'Test Document',
    type: 'pdf',
    num_pages: 3,
    pages: [{ page_number: 1, url: '/page1.png' }],
    link_settings: { id: 'link_abc', allow_download: true },
  };

  const mockViewData = {
    id: 'view_123',
  };
  const mockPublicMeta = {
    owner_name: 'Alice Owner',
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
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockReturnValue(new Promise(() => {})); // Never resolves
    renderComponent('/view/test-slug');
    // Find skeletons by checking for the animation class
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message on API failure', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
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
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockRejectedValue({
      response: { status: 401, data: { protectionType: 'password' } },
    });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Password Form')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
  });

  it('renders EmailForm when protectionType is email', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockRejectedValue({
      response: { status: 401, data: { protectionType: 'email' } },
    });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Email Form')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
  });

  it('fetches data again after successful password submission', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
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
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByText('Preview Viewer')).toBeInTheDocument();
    });
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      previewToken: null,
      accessToken: null,
      dataroomDocumentId: null,
      parentId: null,
    });
    expect(api.createViewSession).toHaveBeenCalledWith({ share_link: 'link_abc' });
  });

  it('keeps polling after a background preview poll fails', async () => {
    vi.useFakeTimers();
    const pendingDocumentData = {
      ...mockDocumentData,
      pages: [],
      preview_status: 'processing',
      render_status: 'queued',
      download_url: '/download/test.pdf',
    };

    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData
      .mockResolvedValueOnce({ data: pendingDocumentData })
      .mockRejectedValueOnce({ response: { status: 502, data: { message: 'Bad Gateway' } } })
      .mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug');

    // Flush initial mock promises
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('This may take a moment for large documents.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // Flush the second fetch promise
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(2);

    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Bad Gateway')).not.toBeInTheDocument();
    expect(screen.getByText('This may take a moment for large documents.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // Flush the third fetch promise
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(3);
  });

  it('passes accessToken from URL to API call', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug?accessToken=my-secret-token');

    await waitFor(() => {
      expect(screen.getByText('Preview Viewer')).toBeInTheDocument();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      previewToken: null,
      accessToken: 'my-secret-token',
      dataroomDocumentId: null,
      parentId: null,
    });
  });

  it('passes parent_id from URL to API call for dataroom scope', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockResolvedValue({
      data: { link_type: 'dataroom', id: 'dr1', name: 'Room', items: [], breadcrumbs: [], link_settings: { id: 'link_abc' } },
    });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug?parent_id=folder-123');

    await waitFor(() => {
      expect(api.getShareLinkViewData).toHaveBeenCalled();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      previewToken: null,
      accessToken: null,
      dataroomDocumentId: null,
      parentId: 'folder-123',
    });
  });

  it('opens Q&A panel for a document share link after view session exists', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByLabelText(/open q&a/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/open q&a/i));

    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Open');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('document-context');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Test Document');
  });

  it('displays document Q&A thread count on the Q&A button', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
    api.createViewSession.mockResolvedValue({ data: mockViewData });
    api.getPublicQnaSummary.mockResolvedValue({ data: { thread_count: 2, open_thread_count: 2, message_count: 3 } });

    renderComponent('/view/test-slug');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Q&A, 2 threads' })).toBeInTheDocument();
    });
    expect(api.getPublicQnaSummary).toHaveBeenCalledWith('test-slug', {
      viewSessionId: 'view_123',
      dataroomDocumentId: null,
    });
  });

  it('passes dataroom document id into Q&A panel for dataroom document view', async () => {
    api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
    api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });

    renderComponent('/view/test-slug?dataroom_document_id=ddoc-123&view_session_id=view-123');

    await waitFor(() => {
      expect(screen.getByLabelText(/open q&a/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/open q&a/i));
 
     expect(screen.getByTestId('qna-panel')).toHaveTextContent('ddoc-123');
   });
 
   it('renders, copies link, and dismisses the Owner Preview banner when previewToken is present', async () => {
     // Mock navigator.clipboard
     const mockWriteText = vi.fn().mockResolvedValue(undefined);
     Object.defineProperty(navigator, 'clipboard', {
       value: { writeText: mockWriteText },
       writable: true,
       configurable: true,
     });
 
     api.getShareLinkPublicMeta.mockResolvedValue({ data: mockPublicMeta });
     api.getShareLinkViewData.mockResolvedValue({ data: mockDocumentData });
     api.createViewSession.mockResolvedValue({ data: mockViewData });
 
     renderComponent('/view/test-slug?previewToken=test-preview-token');
 
     await waitFor(() => {
       expect(screen.getByText(/Owner Preview Mode:/)).toBeInTheDocument();
     });
 
     const copyButton = screen.getByRole('button', { name: /copy the clean link/i });
     expect(copyButton).toBeInTheDocument();
 
     fireEvent.click(copyButton);
     expect(mockWriteText).toHaveBeenCalled();
     await waitFor(() => {
       expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
     });
 
     const dismissButton = screen.getByTitle('Dismiss banner');
     expect(dismissButton).toBeInTheDocument();
 
     fireEvent.click(dismissButton);
 
     expect(screen.queryByText(/Owner Preview Mode:/)).not.toBeInTheDocument();
   });
 });
