import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DataroomViewer } from '../../../components/viewer/DataroomViewer';
import * as api from '../../../services/api';
import { DATAROOM_VIEWER_PAGE_SIZE } from '../../../constants/pagination';

vi.mock('../../../services/api', () => ({
  getShareLinkViewData: vi.fn(),
  getPublicQnaSummary: vi.fn(),
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
    api.getPublicQnaSummary.mockResolvedValue({ data: { thread_count: 0 } });
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

  it('displays current scope Q&A thread count in the header action', async () => {
    api.getPublicQnaSummary.mockResolvedValueOnce({
      data: { thread_count: 2, open_thread_count: 2, message_count: 4 },
    });

    renderComponent({ viewId: 'view-123' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open Q&A for current folder, 2 threads' })).toBeInTheDocument();
    });
    expect(api.getPublicQnaSummary).toHaveBeenCalledWith('test-slug', {
      viewSessionId: 'view-123',
      dataroomFolderId: null,
    });
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

  it('ignores stale document fetches to prevent race conditions', async () => {
    let resolveDoc1;
    const doc1Promise = new Promise((resolve) => {
      resolveDoc1 = resolve;
    });

    api.getShareLinkViewData.mockImplementation((slug, query) => {
      if (query.parentId === 'folder1') {
        return Promise.resolve({
          data: {
            ...mockDataroomData,
            items: [
              { type: 'document', id: 'doc1', name: 'Document 1', document_type: 'pdf' },
              { type: 'document', id: 'doc2', name: 'Document 2', document_type: 'pdf' },
            ],
          },
        });
      }
      if (query.dataroomDocumentId === 'doc1') {
        return doc1Promise.then(() => ({
          data: {
            id: 'doc1',
            name: 'Stale Doc 1',
            type: 'document',
            preview_mode: 'client_pdf',
            link_settings: { allow_download: true },
          },
        }));
      }
      if (query.dataroomDocumentId === 'doc2') {
        return Promise.resolve({
          data: {
            id: 'doc2',
            name: 'Fresh Doc 2',
            type: 'document',
            preview_mode: 'client_pdf',
            link_settings: { allow_download: true },
          },
        });
      }
      return Promise.resolve({ data: mockDataroomData });
    });

    render(
      <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc1']}>
        <DataroomViewer
          data={{
            ...mockDataroomData,
            link_type: 'document',
            id: 'doc1',
            name: 'Stale Doc 1',
            dataroom_context: {
              id: 'dr1',
              name: 'Test Dataroom',
              parent_folder_id: 'folder1',
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Wait for DataroomSiblingNav items to render
    await waitFor(() => {
      expect(screen.getByTitle('Document 1')).toBeInTheDocument();
      expect(screen.getByTitle('Document 2')).toBeInTheDocument();
    });

    // Simulate clicking Document 1 (triggers doc1 fetch which is slow/pending)
    fireEvent.click(screen.getByTitle('Document 1'));

    // Simulate clicking Document 2 (triggers doc2 fetch which resolves immediately)
    fireEvent.click(screen.getByTitle('Document 2'));

    await waitFor(() => {
      expect(screen.getByText('Fresh Doc 2')).toBeInTheDocument();
    });

    // Resolve doc1 (the stale response)
    resolveDoc1();

    // Verify doc2 remains active and doc1 is ignored
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Fresh Doc 2')).toBeInTheDocument();
    expect(screen.queryByText('Stale Doc 1')).not.toBeInTheDocument();
  });

  it('does not trigger infinite loop or hijack navigation when navigating to an empty folder', async () => {
    api.getShareLinkViewData.mockResolvedValue({
      data: {
        ...mockDataroomData,
        items: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc1']}>
        <DataroomViewer
          data={{
            ...mockDataroomData,
            link_type: 'document',
            id: 'doc1',
            name: 'Document 1',
            dataroom_context: {
              id: 'dr1',
              name: 'Test Dataroom',
              parent_folder_id: 'folder1',
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // On mount, parent folder loading triggers one request
    await waitFor(() => {
      expect(api.getShareLinkViewData).toHaveBeenCalledTimes(2);
    });

    // Verify only 2 calls were fired (no infinite loops)
    await new Promise((r) => setTimeout(r, 100));
    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(2);
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      parentId: 'folder1',
      limit: DATAROOM_VIEWER_PAGE_SIZE,
      offset: 0,
    });
  });
});
