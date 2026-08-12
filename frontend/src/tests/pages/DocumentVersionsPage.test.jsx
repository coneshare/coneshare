import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BreadcrumbProvider } from '../../components/layout/BreadcrumbProvider';
import { DocumentVersionsPage } from '../../pages/DocumentVersionsPage';
import * as api from '../../services/api';
import '../../i18n';

vi.mock('../../services/api');

vi.mock('../../components/documents/DocumentPreviewModal', () => ({
  DocumentPreviewModal: () => <div>Preview Modal</div>,
}));

vi.mock('../../contexts/UserProvider', () => ({
  useUser: () => ({
    refreshUser: vi.fn(),
  }),
}));

vi.mock('../../components/documents/VersionHistoryTable', () => ({
  VersionHistoryTable: ({ onPreviewVersion, onPromoteVersion }) => (
    <div>
      <span>Version History Table</span>
      <button onClick={() => onPreviewVersion({ id: 'v1_id', version_number: 1 })}>Preview Version 1</button>
      <button onClick={() => onPromoteVersion({ id: 'v2_id', version_number: 2 })}>Restore Version 2</button>
    </div>
  ),
}));

describe('DocumentVersionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getDocumentVersions.mockResolvedValue({ data: mockVersions });
  });

  const mockDocument = {
    id: 'doc123',
    name: 'Test Doc.pdf',
  };

  const mockVersions = {
    count: 2,
    results: [
      { id: 'v1_id', version_number: 1, is_primary: true },
      { id: 'v2_id', version_number: 2, is_primary: false },
    ]
  };

  const renderComponent = () => {
    return render(
      <MemoryRouter initialEntries={['/documents/doc123/versions']}>
        <BreadcrumbProvider>
          <Routes>
            <Route path="/documents/:documentId/versions" element={<DocumentVersionsPage />} />
            <Route path="/documents/:documentId" element={<div>Document Details Page</div>} />
          </Routes>
        </BreadcrumbProvider>
      </MemoryRouter>
    );
  };

  it('renders loading state initially', () => {
    api.getDocumentDetails.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.queryByText('Version History for')).not.toBeInTheDocument();
  });

  it('renders document versions page once data is loaded', async () => {
    api.getDocumentDetails.mockResolvedValue({ data: mockDocument });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Version History for "Test Doc.pdf"')).toBeInTheDocument();
      expect(screen.getByText('Version History Table')).toBeInTheDocument();
      expect(api.getDocumentVersions).toHaveBeenCalledWith('doc123', 1);
    });
  });

  it('handles back to document button click', async () => {
    api.getDocumentDetails.mockResolvedValue({ data: mockDocument });
    renderComponent();

    await waitFor(() => expect(screen.getByText('Back to Document')).toBeInTheDocument());
    
    const backButton = screen.getByRole('link', { name: /back to document/i });
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByText('Document Details Page')).toBeInTheDocument();
    });
  });

  it('handles promoting a version with confirmation', async () => {
    api.getDocumentDetails.mockResolvedValue({ data: mockDocument });
    api.promoteDocumentVersion.mockResolvedValue({ data: { message: 'success' } });
    
    renderComponent();
    
    await waitFor(() => expect(screen.getByText('Version History Table')).toBeInTheDocument());
    
    const restoreButton = screen.getByRole('button', { name: /restore version 2/i });
    fireEvent.click(restoreButton);
    
    // Confirm dialog should appear
    const dialog = await screen.findByRole('dialog', { name: /restore document version/i });
    expect(within(dialog).getByText(/are you sure you want to restore version v2/i)).toBeInTheDocument();
    
    const confirmButton = within(dialog).getByRole('button', { name: /restore/i });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(api.promoteDocumentVersion).toHaveBeenCalledWith('doc123', 'v2_id');
      expect(api.getDocumentVersions).toHaveBeenCalledTimes(2); // Initial + reload
    });
  });
});
