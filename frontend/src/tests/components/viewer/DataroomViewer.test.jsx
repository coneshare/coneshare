import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DataroomViewer } from '../../../components/viewer/DataroomViewer';
import * as api from '../../../services/api';
import { DATAROOM_VIEWER_PAGE_SIZE } from '../../../constants/pagination';

vi.mock('../../../services/api', () => ({
  getShareLinkViewData: vi.fn(),
  downloadDataroomFolder: vi.fn(),
  recordDataroomVisit: vi.fn(),
}));

// Mock child components that are not relevant to this test
vi.mock('../../../components/viewer/DataroomDocumentPreview', () => ({
  DataroomDocumentPreview: () => <div>Document Preview</div>,
}));

vi.mock('../../../components/viewer/QnAPanel', () => ({
  QnAPanel: ({ open, dataroomDocumentId, dataroomFolderId, contextLabel }) => (
    <div
      data-testid="qna-panel"
      data-document-id={dataroomDocumentId || ''}
      data-folder-id={dataroomFolderId || ''}
    >
      {open ? 'Q&A Open' : 'Q&A Closed'}
      <span>{dataroomDocumentId || ''}</span>
      <span>{dataroomFolderId || ''}</span>
      <span>{contextLabel}</span>
    </div>
  ),
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
    const subFolderButton = screen.getByTitle('Sub Folder A');
    fireEvent.click(subFolderButton);

    // Now, the document inside the sub-folder should be visible
    await waitFor(() => {
      expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();
    });
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      parentId: 'folder1',
      limit: DATAROOM_VIEWER_PAGE_SIZE,
      offset: 0,
    });

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

    fireEvent.click(screen.getByTitle('Sub Folder A'));

    await waitFor(() => {
      expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(1);
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      parentId: 'folder1',
      limit: DATAROOM_VIEWER_PAGE_SIZE,
      offset: 0,
    });
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
    const subFolderButton = screen.getByTitle('Sub Folder A');
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
    expect(api.getShareLinkViewData).toHaveBeenLastCalledWith('test-slug', {
      parentId: null,
      limit: DATAROOM_VIEWER_PAGE_SIZE,
      offset: 0,
    });
  });

  it('loads next page with next_offset when clicking Load more', async () => {
    const initialData = {
      ...mockDataroomData,
      current_parent_id: null,
      pagination: {
        limit: DATAROOM_VIEWER_PAGE_SIZE,
        offset: 0,
        count: 41,
        has_more: true,
        next_offset: DATAROOM_VIEWER_PAGE_SIZE,
      },
    };
    const page2Doc = {
      type: 'document',
      id: 'doc-last',
      document_id: 'doc-last-file',
      name: 'Last Page Doc',
      document_type: 'pdf',
      updated_at: new Date().toISOString(),
      file_size: 512,
      allow_download: true,
    };
    api.getShareLinkViewData.mockResolvedValueOnce({
      data: {
        ...mockDataroomData,
        items: [page2Doc],
        pagination: {
          limit: DATAROOM_VIEWER_PAGE_SIZE,
          offset: DATAROOM_VIEWER_PAGE_SIZE,
          count: 41,
          has_more: false,
          next_offset: null,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={initialData} slug="test-slug" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('Last Page Doc')).toBeInTheDocument();
    });

    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      parentId: null,
      limit: DATAROOM_VIEWER_PAGE_SIZE,
      offset: DATAROOM_VIEWER_PAGE_SIZE,
    });
  });

  it('includes view_session_id when downloading a dataroom document', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');

    renderComponent({ viewId: 'view-123' });

    fireEvent.pointerDown(screen.getByLabelText(/actions for root document/i));
    fireEvent.click(await screen.findByRole('menuitem', { name: /download/i }));

    const anchor = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node) => node?.tagName === 'A');
    expect(anchor).toBeTruthy();
    expect(anchor.href).toContain('/api/v1/links/test-slug/download-file/?dataroom_document_id=doc1&view_session_id=view-123');

    appendSpy.mockRestore();
  });

  it('opens Q&A panel for a dataroom folder from row actions', async () => {
    renderComponent({ viewId: 'view-123' });

    fireEvent.pointerDown(screen.getByLabelText(/actions for sub folder a/i));
    fireEvent.click(await screen.findByRole('menuitem', { name: /q&a/i }));

    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Open');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('folder1');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Sub Folder A');
  });

  it('opens Q&A panel for the current dataroom root from the header action', () => {
    renderComponent({ viewId: 'view-123' });

    fireEvent.click(screen.getByLabelText(/open q&a for current folder/i));

    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Open');
    expect(screen.getByTestId('qna-panel')).toHaveAttribute('data-document-id', '');
    expect(screen.getByTestId('qna-panel')).toHaveAttribute('data-folder-id', '');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Test Dataroom');
  });

  it('opens Q&A panel for the current dataroom folder from the header action', () => {
    render(
      <MemoryRouter initialEntries={['/view/test-slug?parent_id=folder1']}>
        <DataroomViewer
          data={{
            ...mockDataroomData,
            breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            current_parent_id: 'folder1',
            items: [],
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/open q&a for current folder/i));

    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Open');
    expect(screen.getByTestId('qna-panel')).toHaveAttribute('data-folder-id', 'folder1');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Sub Folder A');
  });

  it('opens Q&A panel for a dataroom document from row actions', async () => {
    renderComponent({ viewId: 'view-123' });

    fireEvent.pointerDown(screen.getByLabelText(/actions for root document/i));
    fireEvent.click(await screen.findByRole('menuitem', { name: /q&a/i }));

    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Open');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('doc1');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Root Document');
  });
});
