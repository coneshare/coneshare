import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DocumentPage } from '../../pages/DocumentPage';
import * as api from '../../services/api';

vi.mock('../../services/api');

// Mock child components to isolate the page
vi.mock('../../components/documents/DocumentHeader', () => ({
  DocumentHeader: () => <div>Document Header</div>,
}));
vi.mock('../../components/documents/LinksTable', () => ({
  LinksTable: () => <div>Links Table</div>,
}));
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
    next: 'http://localhost/api/v1/documents/doc123/views/?page=2',
    previous: null,
    results: Array.from({ length: 10 }, (_, i) => ({
      id: `view_${i}`,
      viewer_email: `viewer${i + 1}@test.com`,
    })),
  };
  const mockViewsPage2 = {
    count: 15,
    next: null,
    previous: 'http://localhost/api/v1/documents/doc123/views/?page=1',
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
        </Routes>
      </MemoryRouter>
    );
  };

  it('handles pagination for visitors table', async () => {
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
      screen.getByText((content, node) => node.textContent === 'Showing 1-10 of 15 visitors.')
    ).toBeInTheDocument();    

    // Mock for second page call
    api.getDocumentViews.mockResolvedValueOnce({ data: mockViewsPage2 });

    // Click next page button
    const nextButton = screen.getByRole('button', { name: /go to next page/i });
    fireEvent.click(nextButton);

    // Wait for page 2 to load
    await waitFor(() => {
      expect(api.getDocumentViews).toHaveBeenCalledWith('doc123', 2);
    });

    await waitFor(() => {
      expect(screen.getByText('viewer11@test.com')).toBeInTheDocument();
      expect(screen.getByText('viewer15@test.com')).toBeInTheDocument();
    });
    expect(screen.queryByText('viewer1@test.com')).not.toBeInTheDocument();

    // Check pagination text and state
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(
      screen.getByText((content, node) => node.textContent === 'Showing 11-15 of 15 visitors.')
    ).toBeInTheDocument();    
    expect(screen.getByRole('button', { name: /go to next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /go to last page/i })).toBeDisabled();
  });
});
