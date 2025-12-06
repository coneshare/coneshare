import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DocumentPage } from '../../pages/DocumentPage';
import * as api from '../../services/api';

vi.mock('../../services/api');

// Mock child components to isolate the page
vi.mock('../../components/documents/DocumentHeader', () => ({
  DocumentHeader: ({ onUploadNewVersion, onDownload, onDelete }) => (
    <div>
      <span>Document Header</span>
      <button onClick={onUploadNewVersion}>Upload New Version</button>
      <button onClick={onDownload}>Download</button>
      <button onClick={onDelete}>Delete</button>
    </div>
  ),
}));
// We don't mock VisitorsTable so we can test its integration with the page
vi.mock('../../components/documents/Stats', () => ({
  Stats: () => <div>Stats</div>,
}));
vi.mock('../../components/links/LinkSheet', () => ({
  LinkSheet: () => <div>Link Sheet</div>,
}));
vi.mock('../../components/documents/DocumentPreviewModal', () => ({
  DocumentPreviewModal: () => <div>Preview Modal</div>,
}));

describe('DocumentPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockDocument = { id: 'doc123', name: 'Test Doc', share_links: [] };
  const mockStats = { total_views: 15 };
  const mockViewsPage1 = {
    count: 15,
    next: 'http://localhost/api/v1/documents/doc123/view-sessions/?page=2',
    previous: null,
    results: Array.from({ length: 10 }, (_, i) => ({
      id: `view_${i}`,
      viewer_email: `viewer${i + 1}@test.com`,
    })),
  };
  const mockViewsPage2 = {
    count: 15,
    next: null,
    previous: 'http://localhost/api/v1/documents/doc123/view-sessions/?page=1',
    results: Array.from({ length: 5 }, (_, i) => ({
      id: `view_${i + 10}`,
      viewer_email: `viewer${i + 11}@test.com`,
    })),
  };

  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={['/documents/doc123']}>
        <Routes>
          <Route path="/documents/:documentId" element={<DocumentPage />} />
          <Route path="/documents" element={<div>Documents Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('handles pagination for view sessions table', async () => {
    api.getDocumentDetails.mockResolvedValue({ data: mockDocument });
    api.getDocumentStats.mockResolvedValue({ data: mockStats });
    api.getDocumentViews.mockResolvedValueOnce({ data: mockViewsPage1 }); // First call

    renderComponent();

    // Wait for page 1 to load
    await waitFor(() => {
      expect(screen.getByText('viewer1@test.com')).toBeInTheDocument();
      expect(screen.getByText('viewer10@test.com')).toBeInTheDocument();
    });
    expect(screen.queryByText('viewer11@test.com')).not.toBeInTheDocument();

    // Check pagination text
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByText((content, node) => node.textContent === 'Showing 1-10 of 15 view sessions.')
    ).toBeInTheDocument();

    // Mock for second page call
    api.getDocumentViews.mockResolvedValueOnce({ data: mockViewsPage2 });

    // Click next page button
    const nextButton = screen.getByRole('button', { name: /go to next page/i });
    fireEvent.click(nextButton);

    // Wait for page 2 to load
    await waitFor(() => {
      expect(api.getDocumentViews).toHaveBeenCalledWith('doc123', 2);
      expect(screen.getByText('viewer11@test.com')).toBeInTheDocument();
      expect(screen.getByText('viewer15@test.com')).toBeInTheDocument();
    });
    expect(screen.queryByText('viewer1@test.com')).not.toBeInTheDocument();

    // Check pagination text and state
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(
      screen.getByText((content, node) => node.textContent === 'Showing 11-15 of 15 view sessions.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /go to last page/i })).toBeDisabled();
  });

  describe('Upload New Version', () => {
    beforeEach(() => {
      // Setup mocks for each test in this suite
      api.getDocumentDetails.mockResolvedValue({ data: { ...mockDocument, name: 'Test Doc.pdf' } });
      api.getDocumentStats.mockResolvedValue({ data: mockStats });
      api.getDocumentViews.mockResolvedValue({ data: mockViewsPage1 });
      api.uploadNewVersion.mockResolvedValue({ data: { message: 'success' } });
    });

    it('clicking upload button triggers file input', async () => {
      const { container } = renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const fileInput = container.querySelector('input[type="file"]');
      const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});

      const uploadButton = screen.getByRole('button', { name: /upload new version/i });
      fireEvent.click(uploadButton);

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('uploads a new version with a matching file type', async () => {
      const { container } = renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const fileInput = container.querySelector('input[type="file"]');
      const mockPdfFile = new File(['new content'], 'new-version.pdf', { type: 'application/pdf' });

      fireEvent.change(fileInput, { target: { files: [mockPdfFile] } });

      await waitFor(() => {
        expect(api.uploadNewVersion).toHaveBeenCalledWith('doc123', mockPdfFile);
      });
      expect(screen.queryByText('File Type Mismatch')).not.toBeInTheDocument();
    });

    it('shows confirmation dialog for mismatched file type', async () => {
      const { container } = renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const fileInput = container.querySelector('input[type="file"]');
      const mockDocxFile = new File(['new content'], 'new-version.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      fireEvent.change(fileInput, { target: { files: [mockDocxFile] } });

      await waitFor(() => {
        expect(screen.getByText('File Type Mismatch')).toBeInTheDocument();
      });
      expect(api.uploadNewVersion).not.toHaveBeenCalled();
    });

    it('proceeds with upload after confirming mismatched file type', async () => {
      const { container } = renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const fileInput = container.querySelector('input[type="file"]');
      const mockDocxFile = new File(['new content'], 'new-version.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      fireEvent.change(fileInput, { target: { files: [mockDocxFile] } });

      await waitFor(() => expect(screen.getByText('File Type Mismatch')).toBeInTheDocument());

      const uploadButton = screen.getByRole('button', { name: /upload/i });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(api.uploadNewVersion).toHaveBeenCalledWith('doc123', mockDocxFile);
      });
    });

    it('cancels upload when dismissing mismatched file type dialog', async () => {
      const { container } = renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const fileInput = container.querySelector('input[type="file"]');
      const mockDocxFile = new File(['new content'], 'new-version.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      fireEvent.change(fileInput, { target: { files: [mockDocxFile] } });

      await waitFor(() => expect(screen.getByText('File Type Mismatch')).toBeInTheDocument());

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('File Type Mismatch')).not.toBeInTheDocument();
      });

      // Using a short timeout to ensure no async operations are pending
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(api.uploadNewVersion).not.toHaveBeenCalled();
    });
  });

  describe('LinksTable integration', () => {
    it('renders links table with actions for a document with share links', async () => {
      const mockDocumentWithLinks = {
        id: 'doc123',
        name: 'Test Doc with Links',
        share_links: [
          {
            id: 'link1',
            name: 'Test Link 1',
            slug: 'test-slug-1',
            is_active: true,
            view_count: 0,
            created_at: new Date().toISOString(),
            last_viewed_at: null,
            recent_view_sessions: [],
          },
        ],
      };

      api.getDocumentDetails.mockResolvedValue({ data: mockDocumentWithLinks });
      api.getDocumentStats.mockResolvedValue({ data: { total_views: 0 } });
      api.getDocumentViews.mockResolvedValue({ data: { results: [], count: 0 } });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Test Link 1')).toBeInTheDocument();
      });

      // The action button is a dropdown menu trigger with an sr-only label "Open actions menu".
      const actionButton = screen.getByRole('button', { name: /open actions menu/i });
      expect(actionButton).toBeInTheDocument();

      await userEvent.click(actionButton);

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /preview/i })).toBeInTheDocument();
      });
    });
  });

  describe('Download and Delete', () => {
    beforeEach(() => {
      api.getDocumentDetails.mockResolvedValue({ data: mockDocument });
      api.getDocumentStats.mockResolvedValue({ data: mockStats });
      api.getDocumentViews.mockResolvedValue({ data: { results: [], count: 0 } });
    });

    it('handles document download', async () => {
      api.getDocumentDownloadUrl.mockResolvedValue({ data: { download_url: 'http://example.com/download' } });
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => {});

      renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const downloadButton = screen.getByRole('button', { name: /download/i });
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(api.getDocumentDownloadUrl).toHaveBeenCalledWith('doc123');
        expect(windowOpenSpy).toHaveBeenCalledWith('http://example.com/download', '_blank');
      });

      windowOpenSpy.mockRestore();
    });

    it('handles document deletion with confirmation', async () => {
      api.deleteDocument.mockResolvedValue({});

      renderComponent();
      await waitFor(() => expect(api.getDocumentDetails).toHaveBeenCalled());

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Check for confirmation dialog
      const dialog = await screen.findByRole('dialog', { name: /delete document/i });
      expect(within(dialog).getByText(/are you sure you want to permanently delete/i)).toBeInTheDocument();
      
      const confirmDeleteButton = within(dialog).getByRole('button', { name: /delete/i });
      fireEvent.click(confirmDeleteButton);

      await waitFor(() => {
        expect(api.deleteDocument).toHaveBeenCalledWith('doc123');
      });

      // Check for navigation
      expect(await screen.findByText('Documents Page')).toBeInTheDocument();
    });
  });
});
