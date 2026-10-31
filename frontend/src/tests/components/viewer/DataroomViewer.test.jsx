import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DataroomViewer } from '../../../components/viewer/DataroomViewer';
import * as api from '../../../services/api';
import '../../../i18n';
import { DATAROOM_VIEWER_PAGE_SIZE } from '../../../constants/pagination';
import { printPdf } from '../../../lib/print';

vi.mock('../../../lib/print', () => ({
  printPdf: vi.fn(),
  printImages: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  getShareLinkViewData: vi.fn(),
  getPublicQnaSummary: vi.fn(),
  downloadDataroomFolder: vi.fn(),
  downloadDataroomArchive: vi.fn(),
  recordDataroomVisit: vi.fn(),
}));

// Mock child components that are not relevant to this test
vi.mock('../../../components/viewer/DataroomDocumentPreview', () => ({
  DataroomDocumentPreview: () => <div>Document Preview</div>,
}));

vi.mock('../../../components/documents/PdfJsViewer', () => ({
  PdfJsViewer: ({ dataroomVisitId }) => (
    <div data-testid="pdfjs-viewer" data-visit-id={dataroomVisitId || ''}>
      PdfJs Viewer
    </div>
  ),
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

  it('renders branding banner with updated height classes', () => {
    const bannerData = {
      ...mockDataroomData,
      link_type: 'dataroom',
      branding_banner: 'http://localhost/banner.png',
    };
    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={bannerData} slug="test-slug" />
      </MemoryRouter>
    );

    const bannerImg = screen.getByAltText('Test Dataroom banner');
    expect(bannerImg).toBeInTheDocument();
    expect(bannerImg).toHaveClass('h-40', 'w-full', 'object-cover', 'md:h-56');
  });

  it('omits banner entirely when banner_mode is none', () => {
    const bannerData = {
      ...mockDataroomData,
      link_type: 'dataroom',
      banner_mode: 'none',
      branding_banner: 'http://localhost/banner.png',
    };
    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={bannerData} slug="test-slug" />
      </MemoryRouter>
    );

    expect(screen.queryByAltText(/banner/i)).not.toBeInTheDocument();
  });

  it('renders interactive banner gallery when banner_mode is gallery', () => {
    const galleryData = {
      ...mockDataroomData,
      link_type: 'dataroom',
      banner_mode: 'gallery',
      branding_banner_images: [
        { id: 'b1', image: 'http://localhost/gal1.png', caption: 'Gallery Slide 1' },
        { id: 'b2', image: 'http://localhost/gal2.png', caption: 'Gallery Slide 2' },
      ],
    };
    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={galleryData} slug="test-slug" />
      </MemoryRouter>
    );

    expect(screen.getByRole('region', { name: 'Interactive banner gallery' })).toBeInTheDocument();
    expect(screen.getAllByText('Gallery Slide 1')[0]).toBeInTheDocument();
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

    // Click the "Home" breadcrumb
    fireEvent.click(screen.getByRole('button', { name: /home|root/i }));

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

    fireEvent.keyDown(screen.getByLabelText(/actions for root document/i), { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /download/i }));

    expect(screen.queryByRole('menuitem', { name: /download/i })).not.toBeInTheDocument();

    const anchor = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node) => node?.tagName === 'A');
    expect(anchor).toBeTruthy();
    expect(anchor.href).toContain('/api/v1/links/test-slug/download-file/?dataroom_document_id=doc1&view_session_id=view-123');

    appendSpy.mockRestore();
  });

  it('opens Q&A panel for a dataroom folder from row actions', async () => {
    renderComponent({ viewId: 'view-123' });

    fireEvent.keyDown(screen.getByLabelText(/actions for sub folder a/i), { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /q&a/i }));

    expect(screen.queryByRole('menuitem', { name: /q&a/i })).not.toBeInTheDocument();

    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Open');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('folder1');
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Sub Folder A');
  });

  it('hides all Q&A entry points when Q&A is disabled for the link', async () => {
    renderComponent({
      viewId: 'view-123',
      data: { ...mockDataroomData, link_settings: { id: 'link1', enable_qna: false } },
    });

    expect(screen.queryByLabelText(/open q&a for current folder/i)).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText(/actions for sub folder a/i), { key: 'Enter', code: 'Enter' });
    await screen.findByRole('menuitem', { name: /view/i });

    expect(screen.queryByRole('menuitem', { name: /q&a/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('qna-panel')).toHaveTextContent('Q&A Closed');
  });

  it('keeps Q&A entry points when the link explicitly enables Q&A', () => {
    renderComponent({
      viewId: 'view-123',
      data: { ...mockDataroomData, link_settings: { id: 'link1', enable_qna: true } },
    });

    expect(screen.getByLabelText(/open q&a for current folder/i)).toBeInTheDocument();
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

    fireEvent.keyDown(screen.getByLabelText(/actions for root document/i), { key: 'Enter', code: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /q&a/i }));

    expect(screen.queryByRole('menuitem', { name: /q&a/i })).not.toBeInTheDocument();

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
              { type: 'document', id: 'doc1', name: 'Stale Doc 1', document_type: 'pdf' },
              { type: 'document', id: 'doc2', name: 'Fresh Doc 2', document_type: 'pdf' },
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
              breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Wait for DataroomFileTree items to render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stale Doc 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fresh Doc 2' })).toBeInTheDocument();
    });

    // Simulate clicking Document 1 (triggers doc1 fetch which is slow/pending)
    fireEvent.click(screen.getByRole('button', { name: 'Stale Doc 1' }));

    // Simulate clicking Document 2 (triggers doc2 fetch which resolves immediately)
    fireEvent.click(screen.getByRole('button', { name: 'Fresh Doc 2' }));

    await waitFor(() => {
      expect(screen.getAllByText('Fresh Doc 2').length).toBeGreaterThan(0);
    });

    // Resolve doc1 (the stale response)
    resolveDoc1();

    // Verify doc2 remains active and doc1 is ignored
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Fresh Doc 2', { selector: 'ol li span' })).toBeInTheDocument();
    expect(screen.queryByText('Stale Doc 1', { selector: 'ol li span' })).not.toBeInTheDocument();
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
              breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // On mount, parent folder loading triggers one request
    await waitFor(() => {
      expect(api.getShareLinkViewData).toHaveBeenCalledTimes(4);
    });

    // Verify only 4 calls were fired (no infinite loops)
    await new Promise((r) => setTimeout(r, 100));
    expect(api.getShareLinkViewData).toHaveBeenCalledTimes(4);
    expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
      parentId: 'folder1',
      limit: DATAROOM_VIEWER_PAGE_SIZE,
      offset: 0,
    });
  });

  it('calls recordDataroomVisit exactly once when switching between documents in sidebar', async () => {
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
        return Promise.resolve({
          data: {
            id: 'doc1',
            name: 'Document 1',
            type: 'document',
            preview_mode: 'client_pdf',
            link_settings: { allow_download: true },
          },
        });
      }
      if (query.dataroomDocumentId === 'doc2') {
        return Promise.resolve({
          data: {
            id: 'doc2',
            name: 'Document 2',
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
            name: 'Document 1',
            dataroom_context: {
              id: 'dr1',
              name: 'Test Dataroom',
              parent_folder_id: 'folder1',
              breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Wait for sidebar items to load
    await screen.findByTitle('Document 1');
    await screen.findByTitle('Document 2');

    // Reset calls to recordDataroomVisit
    api.recordDataroomVisit.mockClear();

    // Click Document 2
    fireEvent.click(screen.getByTitle('Document 2'));

    // Wait for Document 2 view data to load and render
    await screen.findByText('Document 2');

    // Verify recordDataroomVisit was called exactly once
    expect(api.recordDataroomVisit).toHaveBeenCalledTimes(1);
    expect(api.recordDataroomVisit).toHaveBeenCalledWith('view-123', { dataroomDocumentId: 'doc2' });
  });

  it('ignores stale recordDataroomVisit responses when switching documents rapidly', async () => {
    let resolveDoc1Visit;
    const doc1VisitPromise = new Promise((resolve) => {
      resolveDoc1Visit = resolve;
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
        return Promise.resolve({
          data: {
            id: 'doc1',
            name: 'Document 1',
            type: 'document',
            preview_mode: 'client_pdf',
            link_settings: { allow_download: true },
          },
        });
      }
      if (query.dataroomDocumentId === 'doc2') {
        return Promise.resolve({
          data: {
            id: 'doc2',
            name: 'Document 2',
            type: 'document',
            preview_mode: 'client_pdf',
            link_settings: { allow_download: true },
          },
        });
      }
      return Promise.resolve({ data: mockDataroomData });
    });

    api.recordDataroomVisit.mockImplementation((viewId, payload) => {
      if (payload.dataroomDocumentId === 'doc1') {
        return doc1VisitPromise;
      }
      if (payload.dataroomDocumentId === 'doc2') {
        return Promise.resolve({ data: { id: 'visit_doc2' } });
      }
      return Promise.resolve({ data: { id: 'visit_default' } });
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
              breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Wait for sidebar items to load
    await screen.findByTitle('Document 1');
    await screen.findByTitle('Document 2');

    // Switch to Document 2 while doc1 visit call is still pending
    fireEvent.click(screen.getByTitle('Document 2'));

    // Wait for Document 2 view data to load and render with visit_doc2
    await waitFor(() => {
      const viewer = screen.getByTestId('pdfjs-viewer');
      expect(viewer).toHaveAttribute('data-visit-id', 'visit_doc2');
    });

    // Now resolve doc1's visit out-of-order
    resolveDoc1Visit({ data: { id: 'visit_doc1_stale' } });

    // Ensure doc1's stale response did not overwrite the visit ID on doc2
    await waitFor(() => {
      const viewer = screen.getByTestId('pdfjs-viewer');
      expect(viewer).toHaveAttribute('data-visit-id', 'visit_doc2');
    });
  });

  it('records visit when returning to the same document after navigating away to folder/root', async () => {
    api.getShareLinkViewData.mockImplementation((slug, query) => {
      if (query?.parentId === 'folder1') {
        return Promise.resolve({
          data: {
            ...mockDataroomData,
            current_parent_id: 'folder1',
            items: [
              { type: 'document', id: 'doc1', name: 'Document 1', document_type: 'pdf' },
            ],
          },
        });
      }
      if (query.dataroomDocumentId === 'doc1') {
        return Promise.resolve({
          data: {
            id: 'doc1',
            name: 'Document 1',
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
            name: 'Document 1',
            dataroom_context: {
              id: 'dr1',
              name: 'Test Dataroom',
              parent_folder_id: 'folder1',
              breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    await screen.findByTitle('Document 1');

    await waitFor(() => {
      expect(api.recordDataroomVisit).toHaveBeenCalledTimes(1);
    });

    api.recordDataroomVisit.mockClear();

    // Navigate to home/root
    fireEvent.click(screen.getByRole('button', { name: /^(home|root)$/i }));

    // Wait until root contents are loaded
    await screen.findByText('Sub Folder A');

    // Navigate back to Document 1 (which is Root Document under mockDataroomData items list with id 'doc1')
    fireEvent.click(screen.getByTitle('Root Document'));

    await waitFor(() => {
      expect(api.recordDataroomVisit).toHaveBeenCalledTimes(1);
    });
  });

  it('expands folder and fetches contents on folder click in sidebar instead of navigating away', async () => {
    api.getShareLinkViewData.mockImplementation((slug, query) => {
      if (query?.parentId === 'folder1') {
        return Promise.resolve({
          data: {
            ...mockDataroomData,
            current_parent_id: 'folder1',
            items: [
              { type: 'folder', id: 'nested_folder', name: 'Nested Folder' },
              { type: 'document', id: 'doc1', name: 'Document 1', document_type: 'pdf' },
            ],
          },
        });
      }
      if (query?.parentId === 'nested_folder') {
        return Promise.resolve({
          data: {
            items: [
              { type: 'document', id: 'nested_doc', name: 'Nested Document', document_type: 'pdf' },
            ],
          },
        });
      }
      if (query.dataroomDocumentId === 'doc1') {
        return Promise.resolve({
          data: {
            id: 'doc1',
            name: 'Document 1',
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
            items: [],
            link_type: 'document',
            id: 'doc1',
            name: 'Document 1',
            dataroom_context: {
              id: 'dr1',
              name: 'Test Dataroom',
              parent_folder_id: 'folder1',
              breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            },
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Sibling sidebar list should show Nested Folder and Document 1
    await screen.findByTitle('Nested Folder');
    await screen.findByRole('button', { name: 'Document 1' });

    // Click Nested Folder
    fireEvent.click(screen.getByTitle('Nested Folder'));

    // Wait for the api call to nested_folder
    await waitFor(() => {
      expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', {
        parentId: 'nested_folder',
        viewSessionId: 'view-123',
      });
    });

    // Nested Document should now be displayed under Nested Folder
    await screen.findByTitle('Nested Document');

    // Make sure the main document viewer is still rendering Document 1 (and didn't navigate away)
    expect(screen.getByRole('heading', { level: 1, name: 'Document 1' })).toBeInTheDocument();
  });

  it('triggers download with view_session_id and dataroom_document_id when downloading a document from the menu', async () => {
    let createdAnchor = null;
    const originalCreateElement = document.createElement;
    const mockClick = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const elem = originalCreateElement.call(document, tagName);
      if (tagName === 'a') {
        elem.click = mockClick;
        createdAnchor = elem;
      }
      return elem;
    });

    render(
      <MemoryRouter>
        <DataroomViewer data={mockDataroomData} slug="test-slug" viewId="view-123" />
      </MemoryRouter>
    );

    const moreBtn = screen.getByRole('button', { name: 'Actions for Root Document' });
    fireEvent.keyDown(moreBtn, { key: 'Enter', code: 'Enter' });

    const downloadBtn = await screen.findByText('Download');
    fireEvent.click(downloadBtn);

    expect(mockClick).toHaveBeenCalled();
    expect(createdAnchor.href).toContain('view_session_id=view-123');
    expect(createdAnchor.href).toContain('dataroom_document_id=doc1');
    vi.restoreAllMocks();
  });

  it('triggers downloadDataroomFolder with viewId when downloading a folder from the menu', async () => {
    api.downloadDataroomFolder.mockResolvedValue({
      data: new Blob(['test']),
      headers: { 'content-disposition': 'filename="Sub Folder A.zip"' },
    });

    const folderData = {
      ...mockDataroomData,
      items: [
        { type: 'folder', id: 'folder1', name: 'Sub Folder A', updated_at: new Date().toISOString(), allow_download: true },
        { type: 'document', id: 'doc1', document_id: 'doc-file-1', name: 'Root Document', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 1024, allow_download: true },
      ],
    };

    render(
      <MemoryRouter>
        <DataroomViewer data={folderData} slug="test-slug" viewId="view-123" />
      </MemoryRouter>
    );

    const moreBtn = screen.getByRole('button', { name: 'Actions for Sub Folder A' });
    fireEvent.keyDown(moreBtn, { key: 'Enter', code: 'Enter' });

    const downloadBtn = await screen.findByText('Download');
    fireEvent.click(downloadBtn);

    expect(api.downloadDataroomFolder).toHaveBeenCalledWith('test-slug', 'folder1', 'view-123');
  });

  it('renders top header Prev and Next File buttons when viewing a document and handles navigation', async () => {
    const multiDocData = {
      id: 'dr1',
      name: 'Test Dataroom',
      breadcrumbs: [],
      items: [
        { type: 'document', id: 'doc1', document_id: 'doc-file-1', name: 'First Document', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 1024, allow_download: true },
        { type: 'document', id: 'doc2', document_id: 'doc-file-2', name: 'Second Document (Video)', document_type: 'video', updated_at: new Date().toISOString(), file_size: 2048, allow_download: true },
      ],
    };

    api.getShareLinkViewData.mockImplementation((slug, options) => {
      if (options?.dataroomDocumentId === 'doc1') {
        return Promise.resolve({
          data: {
            id: 'doc1',
            name: 'First Document',
            type: 'pdf',
            preview_mode: 'client_pdf',
            link_settings: { allow_download: true },
          },
        });
      }
      if (options?.dataroomDocumentId === 'doc2') {
        return Promise.resolve({
          data: {
            id: 'doc2',
            name: 'Second Document (Video)',
            type: 'video',
            preview_mode: 'video',
            video_preview_url: 'http://example.com/video.mp4',
            link_settings: { allow_download: true },
          },
        });
      }
      return Promise.resolve({ data: multiDocData });
    });

    render(
      <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc1']}>
        <DataroomViewer data={multiDocData} slug="test-slug" viewId="view-123" />
      </MemoryRouter>
    );

    // Verify Prev File is disabled and Next File is enabled for first doc
    const prevBtns = await screen.findAllByRole('button', { name: /Prev File/i });
    const nextBtns = await screen.findAllByRole('button', { name: /Next File/i });

    expect(prevBtns[0]).toBeDisabled();
    expect(nextBtns[0]).toBeEnabled();

    // Click Next File to switch to video document
    fireEvent.click(nextBtns[0]);

    await waitFor(() => {
      expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', expect.objectContaining({
        dataroomDocumentId: 'doc2',
      }));
    });
  });

  const subFolderDoc = {
    type: 'document',
    id: 'doc2',
    document_id: 'doc-file-2',
    name: 'Sub Folder Document',
    document_type: 'pdf',
    updated_at: new Date().toISOString(),
    file_size: 2048,
    allow_download: true,
  };

  const mockSubFolderNavigation = () => {
    api.getShareLinkViewData.mockImplementation((slug, query) => {
      if (query?.parentId === 'folder1') {
        return Promise.resolve({
          data: {
            ...mockDataroomData,
            current_parent_id: 'folder1',
            breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            items: [subFolderDoc],
          },
        });
      }
      if (query?.dataroomDocumentId === 'doc2') {
        return Promise.resolve({
          data: {
            id: 'doc2',
            name: 'Sub Folder Document',
            type: 'document',
            preview_mode: 'client_pdf',
            num_pages: 14,
            link_settings: { allow_download: true },
          },
        });
      }
      return Promise.resolve({ data: mockDataroomData });
    });
  };

  const docFetchCount = (docId) =>
    api.getShareLinkViewData.mock.calls.filter(([, query]) => query?.dataroomDocumentId === docId).length;

  it('opens a document clicked from a subfolder list view', async () => {
    mockSubFolderNavigation();

    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={mockDataroomData} slug="test-slug" viewId="view-123" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTitle('Sub Folder A'));
    await screen.findByTitle('Sub Folder Document');

    fireEvent.click(screen.getByTitle('Sub Folder Document'));

    await waitFor(() => {
      expect(api.getShareLinkViewData).toHaveBeenCalledWith('test-slug', expect.objectContaining({
        dataroomDocumentId: 'doc2',
      }));
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading document...')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('No document view data available.')).not.toBeInTheDocument();
  });

  it('refetches a document re-opened after navigating back to the folder list', async () => {
    mockSubFolderNavigation();

    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={mockDataroomData} slug="test-slug" viewId="view-123" />
      </MemoryRouter>
    );

    // Enter the subfolder and open the document once.
    fireEvent.click(screen.getByTitle('Sub Folder A'));
    await screen.findByTitle('Sub Folder Document');
    fireEvent.click(screen.getByTitle('Sub Folder Document'));
    await waitFor(() => {
      expect(docFetchCount('doc2')).toBe(1);
    });

    // Navigate back out to the home/root list, then into the subfolder again.
    fireEvent.click(screen.getByRole('button', { name: /^(home|root)$/i }));
    await screen.findByTitle('Sub Folder A');
    fireEvent.click(screen.getByTitle('Sub Folder A'));
    await screen.findByTitle('Sub Folder Document');

    // Re-open the same document.
    fireEvent.click(screen.getByTitle('Sub Folder Document'));

    await waitFor(() => {
      expect(docFetchCount('doc2')).toBe(2);
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading document...')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('No document view data available.')).not.toBeInTheDocument();
  });

  it('retries a document fetch when the same item is clicked after a failure', async () => {
    let shouldFail = true;
    api.getShareLinkViewData.mockImplementation((slug, query) => {
      if (query?.parentId === 'folder1') {
        return Promise.resolve({
          data: {
            ...mockDataroomData,
            current_parent_id: 'folder1',
            breadcrumbs: [{ id: 'folder1', name: 'Sub Folder A' }],
            items: [subFolderDoc],
          },
        });
      }
      if (query?.dataroomDocumentId === 'doc2') {
        if (shouldFail) {
          shouldFail = false;
          return Promise.reject(new Error('network down'));
        }
        return Promise.resolve({
          data: {
            id: 'doc2',
            name: 'Sub Folder Document',
            type: 'document',
            preview_mode: 'client_pdf',
            num_pages: 14,
            link_settings: { allow_download: true },
          },
        });
      }
      return Promise.resolve({ data: mockDataroomData });
    });

    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer data={mockDataroomData} slug="test-slug" viewId="view-123" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTitle('Sub Folder A'));
    await screen.findByTitle('Sub Folder Document');
    fireEvent.click(screen.getByTitle('Sub Folder Document'));

    await screen.findByText('No document view data available.');

    // Click the same document again from the sidebar tree.
    fireEvent.click(await screen.findByTitle('Sub Folder Document'));

    await waitFor(() => {
      expect(docFetchCount('doc2')).toBe(2);
    });
    await waitFor(() => {
      expect(screen.queryByText('No document view data available.')).not.toBeInTheDocument();
    });
  });

  it('toggles view mode between list and grid and persists preference in localStorage', async () => {
    localStorage.clear();
    renderComponent();

    const gridBtn = screen.getByRole('button', { name: /Grid view/i });
    const listBtn = screen.getByRole('button', { name: /List view/i });

    expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    expect(gridBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch to grid view
    fireEvent.click(gridBtn);
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('coneshare_dataroom_view_mode')).toBe('grid');

    // In grid view, document card is rendered
    expect(screen.getByTestId('document-card-doc1')).toBeInTheDocument();

    // Switch back to list view
    fireEvent.click(listBtn);
    expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('coneshare_dataroom_view_mode')).toBe('list');
    expect(screen.queryByTestId('document-card-doc1')).not.toBeInTheDocument();
  });

  it('filters items in folder by search query and shows empty match state', async () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/Filter files in this folder/i);
    expect(screen.getByText('Root Document')).toBeInTheDocument();
    expect(screen.getByText('Sub Folder A')).toBeInTheDocument();

    // Filter by 'Folder'
    fireEvent.change(searchInput, { target: { value: 'Folder' } });
    expect(screen.getByText('Sub Folder A')).toBeInTheDocument();
    expect(screen.queryByText('Root Document')).not.toBeInTheDocument();

    // Filter by nonexistent string
    fireEvent.change(searchInput, { target: { value: 'nonexistent-query-xyz' } });
    expect(screen.queryByText('Sub Folder A')).not.toBeInTheDocument();
    expect(screen.queryByText('Root Document')).not.toBeInTheDocument();
    expect(screen.getByText(/No files or folders match your filter/i)).toBeInTheDocument();
  });

  it('focuses search input when ⌘K keyboard shortcut is pressed', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/Filter files in this folder/i);
    const focusSpy = vi.spyOn(searchInput, 'focus');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('focuses search input when Ctrl+K keyboard shortcut is pressed', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/Filter files in this folder/i);
    const focusSpy = vi.spyOn(searchInput, 'focus');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('renders ⌘K shortcut hint on macOS and Ctrl+K on Windows/Linux', () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel', userAgent: 'Macintosh' });
    const { unmount } = renderComponent();
    expect(screen.getByText('⌘K')).toBeInTheDocument();
    unmount();

    vi.stubGlobal('navigator', { ...navigator, platform: 'Win32', userAgent: 'Windows NT 10.0' });
    renderComponent();
    expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('renders permanently resident Folders and Documents sections with empty tips when sections have 0 items', () => {
    render(
      <MemoryRouter initialEntries={['/view/test-slug']}>
        <DataroomViewer
          data={{
            ...mockDataroomData,
            items: [{ type: 'document', id: 'doc1', name: 'Sole Document', document_type: 'pdf', updated_at: new Date().toISOString() }],
          }}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Folders section header is visible with count 0
    expect(screen.getByText(/Folders \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/No folders in this directory/i)).toBeInTheDocument();

    // Documents section header is visible with Sole Document
    expect(screen.getByText(/DOCUMENTS \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Sole Document')).toBeInTheDocument();
  });

  it('renders Featured resources grid when items have is_starred, and retains them in regular lists', async () => {
    const dataroomWithStarred = {
      ...mockDataroomData,
      items: [
        {
          id: 'starred-folder-1',
          name: '01 Highlight Folder',
          type: 'folder',
          is_starred: true,
          allow_download: true,
          updated_at: '2026-10-18T10:00:00Z',
        },
        {
          id: 'starred-doc-2',
          name: 'Executive Summary.pdf',
          type: 'document',
          document_type: 'pdf',
          is_starred: true,
          file_size: 1048576,
          allow_download: true,
          updated_at: '2026-10-19T10:00:00Z',
        },
        {
          id: 'regular-doc-3',
          name: 'Standard Annex.pdf',
          type: 'document',
          document_type: 'pdf',
          is_starred: false,
          file_size: 2048,
          allow_download: true,
          updated_at: '2026-10-17T10:00:00Z',
        },
      ],
    };

    render(
      <MemoryRouter>
        <DataroomViewer
          data={dataroomWithStarred}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Featured section is rendered with count 2
    expect(screen.getByText(/Featured Resources \(2\)/i)).toBeInTheDocument();

    // The starred items are also retained in regular sections (dual display)
    expect(screen.getByText(/Folders \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/DOCUMENTS \(2\)/i)).toBeInTheDocument();

    // Star icon / badge is no longer rendered in the regular document/folder list items
    expect(screen.queryByTitle('Featured')).not.toBeInTheDocument();
  });

  it('enables Q&A in DocumentViewerHeader when document is active and Q&A is enabled', async () => {
    const dataroomDataWithQna = {
      ...mockDataroomData,
      link_settings: {
        ...mockDataroomData.link_settings,
        enable_qna: true,
      },
      items: [
        {
          id: 'doc-1',
          name: 'Active Document.pdf',
          type: 'document',
          document_type: 'pdf',
          preview_mode: 'client_pdf',
          file_size: 1048576,
        },
      ],
    };

    render(
      <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc-1']}>
        <DataroomViewer
          data={dataroomDataWithQna}
          slug="test-slug"
          viewId="view-123"
        />
      </MemoryRouter>
    );

    // Document is active, so DocumentViewerHeader has Q&A button rendered
    expect(screen.getByRole('button', { name: /Q&A/i })).toBeInTheDocument();
  });

  it('renders NDA badge in DocumentViewerHeader when publicMeta has require_nda true', () => {
    render(
      <MemoryRouter>
        <DataroomViewer
          data={mockDataroomData}
          slug="test-slug"
          viewId="view-123"
          publicMeta={{ require_nda: true }}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId('header-nda-badge')).toBeInTheDocument();
  });

  it('defaults sidebar to collapsed on mobile when opening a document', () => {
    const originalInnerWidth = window.innerWidth;
    window.innerWidth = 480;

    const dataroomDocData = {
      ...mockDataroomData,
      items: [
        {
          id: 'doc-1',
          name: 'Mobile Document.pdf',
          type: 'document',
          document_type: 'pdf',
          preview_mode: 'client_pdf',
          file_size: 1048576,
        },
      ],
    };

    try {
      render(
        <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc-1']}>
          <DataroomViewer
            data={dataroomDocData}
            slug="test-slug"
            viewId="view-123"
          />
        </MemoryRouter>
      );

      // On mobile (< 768px), sidebar should be collapsed by default (renders Expand Sidebar button)
      expect(screen.getByTitle('Expand Sidebar')).toBeInTheDocument();
      expect(screen.queryByTitle('Collapse Sidebar')).not.toBeInTheDocument();
    } finally {
      window.innerWidth = originalInnerWidth;
    }
  });

  describe('Print Security Controls (T4-03)', () => {
    it('routes printing through watermarked docDownloadUrl when watermark is enabled', async () => {
      const docViewData = {
        id: 'doc-watermark',
        name: 'Report.pdf',
        type: 'pdf',
        preview_mode: 'client_pdf',
        pdf_preview_url: 'https://example.com/raw-report.pdf',
        link_settings: {
          allow_download: true,
          enable_watermark: true,
          watermark_text: 'CONFIDENTIAL_NDA',
        },
      };

      api.getShareLinkViewData.mockResolvedValue({ data: docViewData });

      render(
        <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc-watermark']}>
          <DataroomViewer
            data={{
              ...mockDataroomData,
              items: [
                {
                  type: 'document',
                  id: 'doc-watermark',
                  document_id: 'doc-file-wm',
                  name: 'Report.pdf',
                  document_type: 'pdf',
                  preview_mode: 'client_pdf',
                  file_size: 1024,
                },
              ],
            }}
            slug="test-slug"
            viewId="view-999"
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTitle('Print document')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Print document'));
      expect(printPdf).toHaveBeenCalledWith('/api/v1/links/test-slug/download-file/?dataroom_document_id=doc-watermark&view_session_id=view-999&inline=true');
      expect(printPdf).not.toHaveBeenCalledWith('https://example.com/raw-report.pdf');
    });

    it('hides print button when allow_download is false', async () => {
      const docViewData = {
        id: 'doc-no-download',
        name: 'Restricted.pdf',
        type: 'pdf',
        preview_mode: 'client_pdf',
        pdf_preview_url: 'https://example.com/raw-restricted.pdf',
        link_settings: {
          allow_download: false,
        },
      };

      api.getShareLinkViewData.mockResolvedValue({ data: docViewData });

      render(
        <MemoryRouter initialEntries={['/view/test-slug?dataroom_document_id=doc-no-download']}>
          <DataroomViewer
            data={{
              ...mockDataroomData,
              items: [
                {
                  type: 'document',
                  id: 'doc-no-download',
                  document_id: 'doc-file-nd',
                  name: 'Restricted.pdf',
                  document_type: 'pdf',
                  preview_mode: 'client_pdf',
                  file_size: 1024,
                },
              ],
            }}
            slug="test-slug"
            viewId="view-999"
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Restricted.pdf')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Print document')).not.toBeInTheDocument();
      expect(printPdf).not.toHaveBeenCalled();
    });
  });

  describe('Download All whole-dataroom feature', () => {
    it('renders Download all button when link allows download and items allow download', () => {
      renderComponent({
        data: {
          ...mockDataroomData,
          link_settings: { allow_download: true },
        },
      });

      expect(screen.getByRole('button', { name: 'Download all' })).toBeInTheDocument();
    });

    it('renders Download all button at root even if initial loaded items are all view-only (fixes Issue 11 pagination blind spot)', () => {
      renderComponent({
        data: {
          ...mockDataroomData,
          items: [
            { id: 'doc-restricted-1', name: 'Restricted 1.pdf', allow_download: false, type: 'document' },
            { id: 'doc-restricted-2', name: 'Restricted 2.pdf', allow_download: false, type: 'document' },
          ],
          link_settings: { allow_download: true },
        },
      });

      expect(screen.getByRole('button', { name: 'Download all' })).toBeInTheDocument();
    });

    it('hides Download all button when link allow_download is false', () => {
      renderComponent({
        data: {
          ...mockDataroomData,
          link_settings: { allow_download: false },
        },
      });

      expect(screen.queryByRole('button', { name: 'Download all' })).not.toBeInTheDocument();
    });

    it('triggers whole-dataroom download with view_session_id when Download all is clicked', async () => {
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-archive-url');
      window.URL.revokeObjectURL = vi.fn();

      api.downloadDataroomArchive.mockResolvedValueOnce({
        data: new Blob(['archive-data']),
        headers: { 'content-disposition': 'attachment; filename="Test Dataroom.zip"' },
      });

      renderComponent({
        data: {
          ...mockDataroomData,
          link_settings: { allow_download: true },
        },
        viewId: 'view-session-123',
      });

      const downloadAllBtn = screen.getByRole('button', { name: 'Download all' });
      fireEvent.click(downloadAllBtn);

      await waitFor(() => {
        expect(api.downloadDataroomArchive).toHaveBeenCalledWith('test-slug', 'view-session-123');
      });

      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('switches to Download folder button when inside a subfolder and triggers downloadDataroomFolder on click', async () => {
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-folder-url');
      window.URL.revokeObjectURL = vi.fn();

      api.downloadDataroomFolder.mockResolvedValueOnce({
        data: new Blob(['folder-data']),
        headers: { 'content-disposition': 'attachment; filename="Contracts.zip"' },
      });

      renderComponent({
        data: {
          ...mockDataroomData,
          current_parent_id: 'subfolder-contracts',
          breadcrumbs: [{ id: 'subfolder-contracts', name: 'Contracts' }],
          items: [
            { id: 'doc-contract', name: 'Agreement.pdf', allow_download: true, type: 'document' },
          ],
          link_settings: { allow_download: true },
        },
        viewId: 'view-session-123',
      });

      const downloadFolderBtn = screen.getByRole('button', { name: 'Download folder' });
      expect(downloadFolderBtn).toBeInTheDocument();

      fireEvent.click(downloadFolderBtn);

      await waitFor(() => {
        expect(api.downloadDataroomFolder).toHaveBeenCalledWith('test-slug', 'subfolder-contracts', 'view-session-123');
      });

      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('hides Download folder button when inside a subfolder if subfolder has no downloadable items', () => {
      renderComponent({
        data: {
          ...mockDataroomData,
          current_parent_id: 'subfolder-123',
          items: [
            { id: 'doc-restricted', name: 'Confidential.pdf', allow_download: false, type: 'document' },
          ],
          link_settings: { allow_download: true },
        },
      });

      expect(screen.queryByRole('button', { name: 'Download folder' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Download all' })).not.toBeInTheDocument();
    });

    it('shows error toast when whole-dataroom download fails', async () => {
      api.downloadDataroomArchive.mockRejectedValueOnce(new Error('Network error'));

      renderComponent({
        data: {
          ...mockDataroomData,
          link_settings: { allow_download: true },
        },
        viewId: 'view-session-123',
      });

      const downloadAllBtn = screen.getByRole('button', { name: 'Download all' });
      fireEvent.click(downloadAllBtn);

      await waitFor(() => {
        expect(api.downloadDataroomArchive).toHaveBeenCalledWith('test-slug', 'view-session-123');
      });

      await waitFor(() => {
        expect(downloadAllBtn).not.toBeDisabled();
      });
    });
  });
});

