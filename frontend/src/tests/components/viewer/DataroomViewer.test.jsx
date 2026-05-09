import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DataroomViewer } from '../../../components/viewer/DataroomViewer';
import * as api from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getShareLinkViewData: vi.fn(),
  downloadDataroomFolder: vi.fn(),
  recordDataroomVisit: vi.fn(),
}));

// Mock child components that are not relevant to this test
vi.mock('../../../components/viewer/DataroomDocumentPreview', () => ({
  DataroomDocumentPreview: () => <div>Document Preview</div>,
}));

describe('DataroomViewer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.recordDataroomVisit.mockResolvedValue({ data: { id: 'visit_1' } });
  });

  const mockDataroomData = {
    id: 'dr1',
    name: 'Test Dataroom',
    breadcrumbs: [],
    items: [
      { type: 'folder', id: 'folder1', name: 'Sub Folder A', updated_at: new Date().toISOString() },
      { type: 'document', id: 'doc1', document_id: 'doc-file-1', name: 'Root Document', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 1024, allow_download: true },
    ],
  };

  const renderComponent = (props = {}) => {
    return render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={mockDataroomData} slug="test-slug" {...props} />
      </MemoryRouter>
    );
  };

  it('renders root items correctly', () => {
    renderComponent();

    expect(screen.getByText('Root Document')).toBeInTheDocument();
    expect(screen.getByText('Sub Folder A')).toBeInTheDocument();
    expect(screen.queryByText('Sub Folder Document')).not.toBeInTheDocument();
  });

  it('navigates into a sub-folder and displays its contents', async () => {
    api.getShareLinkViewData.mockResolvedValueOnce({
      data: {
        ...mockDataroomData,
        breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
        current_parent_id: 'folder1',
        items: [
          { type: 'document', id: 'doc2', document_id: 'doc-file-2', name: 'Sub Folder Document', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 2048, allow_download: true },
        ],
      },
    });
    renderComponent();

    // Initially, sub-folder document is not visible
    expect(screen.queryByText('Sub Folder Document')).not.toBeInTheDocument();

    // Click on the sub-folder
    const subFolderButton = screen.getByRole('button', { name: /sub folder a/i });
    fireEvent.click(subFolderButton);

    // Now, the document inside the sub-folder should be visible
    await waitFor(() => {
      expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();
    });
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', { parentId: 'folder1' });

    // The root document should no longer be visible
    expect(screen.queryByText('Root Document')).not.toBeInTheDocument();
  });

  it('sends only one scoped request when navigating into a folder', async () => {
    api.getShareLinkViewData.mockResolvedValue({
      data: {
        ...mockDataroomData,
        breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
        current_parent_id: 'folder1',
        items: [
          { type: 'document', id: 'doc2', document_id: 'doc-file-2', name: 'Sub Folder Document', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 2048, allow_download: true },
        ],
      },
    });

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /sub folder a/i }));

    await waitFor(() => {
      expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(1);
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', { parentId: 'folder1' });
  });

  it('navigates back to root using the breadcrumb', async () => {
    api.getShareLinkViewData
      .mockResolvedValueOnce({
        data: {
          ...mockDataroomData,
          breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
          current_parent_id: 'folder1',
          items: [
            { type: 'document', id: 'doc2', document_id: 'doc-file-2', name: 'Sub Folder Document', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 2048, allow_download: true },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: mockDataroomData,
      });

    renderComponent();

    // Navigate into the sub-folder
    const subFolderButton = screen.getByRole('button', { name: /sub folder a/i });
    fireEvent.click(subFolderButton);
    await waitFor(() => {
      expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();
    });

    // Click the "Root" breadcrumb
    fireEvent.click(screen.getByRole('button', { name: /root/i }));

    // Should be back at the root, seeing the root items
    await waitFor(() => {
      expect(screen.getByText('Root Document')).toBeInTheDocument();
      expect(screen.getByText('Sub Folder A')).toBeInTheDocument();
      expect(screen.queryByText('Sub Folder Document')).not.toBeInTheDocument();
    });
    expect(api.getShareLinkViewData).toHaveBeenLastCalledWith('test-slug', { parentId: null });
  });

  it('includes view_session_id when downloading a dataroom document', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    renderComponent({ viewId: 'view-123' });

    fireEvent.click(screen.getByTitle('Download "Root Document"'));

    const anchor = appendSpy.mock.calls[0][0];
    expect(anchor.href).toContain('/api/v1/links/test-slug/download-file/?dataroom_document_id=doc1&view_session_id=view-123');

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
