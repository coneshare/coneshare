import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataroomViewer } from '../../../components/viewer/DataroomViewer';

// Mock child components that are not relevant to this test
vi.mock('../../../components/viewer/DataroomDocumentPreview', () => ({
  DataroomDocumentPreview: () => <div>Document Preview</div>,
}));

describe('DataroomViewer', () => {
  const mockDataroomData = {
    id: 'dr1',
    name: 'Test Dataroom',
    folders: [
      { id: 'folder1', name: 'Sub Folder A', parent: null, updated_at: new Date().toISOString() },
    ],
    documents: [
      { id: 'doc1', document_id: 'doc-file-1', document_name: 'Root Document', parent: null, document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 1024, allow_download: true },
      { id: 'doc2', document_id: 'doc-file-2', document_name: 'Sub Folder Document', parent: 'folder1', document_type: 'pdf', updated_at: new Date().toISOString(), file_size: 2048, allow_download: true },
    ],
  };

  it('renders root items correctly', () => {
    render(<DataroomViewer data={mockDataroomData} slug="test-slug" />);

    expect(screen.getByText('Root Document')).toBeInTheDocument();
    expect(screen.getByText('Sub Folder A')).toBeInTheDocument();
    expect(screen.queryByText('Sub Folder Document')).not.toBeInTheDocument();
  });

  it('navigates into a sub-folder and displays its contents', () => {
    render(<DataroomViewer data={mockDataroomData} slug="test-slug" />);

    // Initially, sub-folder document is not visible
    expect(screen.queryByText('Sub Folder Document')).not.toBeInTheDocument();

    // Click on the sub-folder
    const subFolderButton = screen.getByRole('button', { name: /sub folder a/i });
    fireEvent.click(subFolderButton);


    // Now, the document inside the sub-folder should be visible
    expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();

    // The root document should no longer be visible
    expect(screen.queryByText('Root Document')).not.toBeInTheDocument();
  });

  it('navigates back to root using the breadcrumb', () => {
    render(<DataroomViewer data={mockDataroomData} slug="test-slug" />);

    // Navigate into the sub-folder
    const subFolderButton = screen.getByRole('button', { name: /sub folder a/i });
    fireEvent.click(subFolderButton);
    expect(screen.getByText('Sub Folder Document')).toBeInTheDocument();

    // Click the "Root" breadcrumb
    fireEvent.click(screen.getByRole('button', { name: /root/i }));

    // Should be back at the root, seeing the root items
    expect(screen.getByText('Root Document')).toBeInTheDocument();
    expect(screen.getByText('Sub Folder A')).toBeInTheDocument();
    expect(screen.queryByText('Sub Folder Document')).not.toBeInTheDocument();
  });

  it('includes view_session_id when downloading a dataroom document', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    render(<DataroomViewer data={mockDataroomData} slug="test-slug" viewId="view-123" />);

    fireEvent.click(screen.getByTitle('Download "Root Document"'));

    const anchor = appendSpy.mock.calls[0][0];
    expect(anchor.href).toContain('/api/v1/links/test-slug/download-file/?document_id=doc-file-1&view_session_id=view-123');

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
