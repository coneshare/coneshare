import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as BreadcrumbProvider from '../../components/layout/BreadcrumbProvider';
import DocumentsPage from '../../pages/DocumentsPage';
import * as api from '../../services/api';

// Mock the api service
vi.mock('../../services/api');

// Mock child components that are not relevant to the test
vi.mock('../../components/documents/Pagination', () => ({
  Pagination: () => <div>Pagination Mock</div>,
}));

describe('DocumentsPage', () => {
  let consoleErrorSpy;
  let mockSetBreadcrumbData;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Default successful mock for initial data fetch
    api.getRootFolderContents.mockResolvedValue({
      data: { current_folder: null, sub_folders: [], documents: [] },
    });
    api.getFolderContents.mockResolvedValue({
      data: {
        current_folder: { id: 'folder123', name: 'Test Folder', ancestors: [] },
        sub_folders: [],
        documents: [],
      },
    });

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock the useBreadcrumb hook
    mockSetBreadcrumbData = vi.fn();
    vi.spyOn(BreadcrumbProvider, 'useBreadcrumb').mockReturnValue({
      setBreadcrumbData: mockSetBreadcrumbData,
    });    
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  const renderComponent = (route = '/documents') => {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/folders/:folderId" element={<DocumentsPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  const createFile = (name, type = 'text/plain') => {
    return new File(['content'], name, { type });
  };

  const findFileInput = () => {
    // The input is hidden and not easily accessible via roles. We find it relative to the upload button.
    const uploadButton = screen.getByTitle('Upload');
    return uploadButton.parentElement.querySelector(
      'input[type="file"][multiple]'
    );
  };

  const findFolderInput = () => {
    const uploadButton = screen.getByTitle('Upload');
    return uploadButton.parentElement.querySelector(
      'input[type="file"][webkitdirectory]'
    );
  };

  it('should render the page and fetch initial data for root', async () => {
    renderComponent('/documents');

    await waitFor(() => {
      expect(api.getRootFolderContents).toHaveBeenCalledTimes(1);
      expect(api.getFolderContents).not.toHaveBeenCalled();
      // Verify it sets the breadcrumb context to null for the root folder
      expect(mockSetBreadcrumbData).toHaveBeenCalledWith(null);
    });
  });  

  describe('Folder Navigation', () => {
    it('should fetch folder-specific content when a folderId is in the URL', async () => {
      const folderId = 'folder123';
      const mockCurrentFolder = { id: 'folder123', name: 'Test Folder', ancestors: [] };

      // Override default mock for this specific test case
      api.getFolderContents.mockResolvedValue({
        data: {
          current_folder: mockCurrentFolder,
          sub_folders: [],
          documents: [],
        },
      });

      renderComponent(`/documents/folders/${folderId}`);

      await waitFor(() => {
        expect(api.getFolderContents).toHaveBeenCalledWith(folderId);
        // Verify it passes the correct folder data to the breadcrumb context
        expect(mockSetBreadcrumbData).toHaveBeenCalledWith(mockCurrentFolder);
      });
    });
  });  

  describe('File Upload Scenarios', () => {
    it('should call uploadDocument for each file and refetch data when all uploads succeed', async () => {
      renderComponent();

      const file1 = createFile('file1.txt');
      const file2 = createFile('file2.txt');

      api.uploadDocument.mockResolvedValue({ status: 202 });

      const fileInput = findFileInput();

      // Simulate user selecting files
      fireEvent.change(fileInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, null);
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, null);

      // getRootFolderContents called once initially, then again after successful upload
      await waitFor(() => {
        expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should refetch data and log an error if at least one file upload succeeds', async () => {
      renderComponent();

      const successFile = createFile('success.txt');
      const failFile = createFile('fail.txt');

      api.uploadDocument
        .mockResolvedValueOnce({ status: 202 }) // for successFile
        .mockRejectedValueOnce(new Error('Upload failed')); // for failFile

      const fileInput = findFileInput();

      fireEvent.change(fileInput, {
        target: { files: [successFile, failFile] },
      });

      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });

      // Should refetch because one succeeded
      await waitFor(() => {
        expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
      });

      // Should log an error for the failed upload
      expect(consoleErrorSpy).toHaveBeenCalledWith('1 file(s) failed to upload.');
    });

    it('should NOT refetch data but log an error if all files fail to upload', async () => {
      renderComponent();

      const file1 = createFile('fail1.txt');
      const file2 = createFile('fail2.txt');

      api.uploadDocument.mockRejectedValue(new Error('Upload failed'));

      const fileInput = findFileInput();

      fireEvent.change(fileInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });

      // Only called on initial render
      // Use a small timeout to ensure no other calls are made
      await new Promise((res) => setTimeout(res, 50));
      expect(api.getRootFolderContents).toHaveBeenCalledTimes(1);

      expect(consoleErrorSpy).toHaveBeenCalledWith('2 file(s) failed to upload.');
    });
  });

  describe('Folder Upload Scenarios', () => {
    const createFolderFile = (path, name) => {
      const file = new File(['content'], name, { type: 'text/plain' });
      // Mock webkitRelativePath for testing
      Object.defineProperty(file, 'webkitRelativePath', {
        value: path,
      });
      return file;
    };

    it('should call ensureFolderPaths once then uploadDocument for each file', async () => {
      renderComponent();

      const file1 = createFolderFile('folderA/file1.txt', 'file1.txt');
      const file2 = createFolderFile('folderA/file2.txt', 'file2.txt');

      // Mock API calls
      api.ensureFolderPaths.mockResolvedValue({ data: { path_mappings: { folderA: 'folderA' } } });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1, file2] },
      });

      // Verify folder path is created first
      await waitFor(() => {
        expect(api.ensureFolderPaths).toHaveBeenCalledTimes(1);
      });
      expect(api.ensureFolderPaths).toHaveBeenCalledWith(['folderA'], null);

      // Verify documents are uploaded next
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderA/file1.txt');
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'folderA/file2.txt');

      // Verify data is refetched on success
      await waitFor(() => {
        expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
      });
    });

    it('should correctly normalize and create unique folder paths from webkitdirectory', async () => {
      renderComponent();

      const file1 = createFolderFile('/folderA/sub1/file1.txt', 'file1.txt'); // Leading slash
      const file2 = createFolderFile('folderB/file2.txt', 'file2.txt');
      const file3 = createFolderFile('folderA/sub1/file3.txt', 'file3.txt'); // Duplicate path

      api.ensureFolderPaths.mockResolvedValue({ data: { path_mappings: {} } });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1, file2, file3] },
      });

      // Verify folder paths are created (and normalized)
      await waitFor(() => {
        expect(api.ensureFolderPaths).toHaveBeenCalledTimes(1);
      });
      expect(api.ensureFolderPaths).toHaveBeenCalledWith(
        expect.arrayContaining(['folderA/sub1', 'folderB']),
        null
      );
      expect(api.ensureFolderPaths.mock.calls[0][0].length).toBe(2);

      // Verify documents are uploaded with original (non-normalized) paths
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(3);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, '/folderA/sub1/file1.txt');

      // Verify data is refetched
      await waitFor(() => {
        expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
      });
    });

    it('should stop and log error if folder creation fails', async () => {
      renderComponent();

      const file1 = createFolderFile('folderC/file1.txt', 'file1.txt');
      api.ensureFolderPaths.mockRejectedValue(new Error('Folder creation failed'));

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1] },
      });

      await waitFor(() => {
        expect(api.ensureFolderPaths).toHaveBeenCalledWith(['folderC'], null);
      });

      // Ensure uploadDocument is NOT called
      expect(api.uploadDocument).not.toHaveBeenCalled();

      // Ensure data is NOT refetched
      expect(api.getRootFolderContents).toHaveBeenCalledTimes(1);

      // Ensure error is logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create folder structure:',
        expect.any(Error)
      );
    });

    it('should use path mappings from ensureFolderPaths for upload', async () => {
      renderComponent();

      const file1 = createFolderFile('folderA/file1.txt', 'file1.txt');

      // Mock API calls
      api.ensureFolderPaths.mockResolvedValue({
        data: { path_mappings: { 'folderA': 'folderA (2)' } },
      });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1] },
      });

      // Verify folder path is created
      await waitFor(() => {
        expect(api.ensureFolderPaths).toHaveBeenCalledWith(['folderA'], null);
      });

      // Verify document is uploaded with the RENAMED path
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderA (2)/file1.txt');
      });
    });

    it('should handle folder upload inside a subfolder', async () => {
      const parentFolderId = 'parent123';
      const mockCurrentFolder = {
        id: parentFolderId,
        name: 'Parent',
        ancestors: [{ id: 'grandparent', name: 'Grandparent' }],
      };
      api.getFolderContents.mockResolvedValue({
        data: { current_folder: mockCurrentFolder, sub_folders: [], documents: [] },
      });

      renderComponent(`/documents/folders/${parentFolderId}`);
      await waitFor(() => expect(api.getFolderContents).toHaveBeenCalledWith(parentFolderId));

      const file1 = createFolderFile('new-folder/file1.txt', 'file1.txt');
      api.ensureFolderPaths.mockResolvedValue({
        data: { path_mappings: { 'new-folder': 'new-folder (2)' } },
      });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();
      fireEvent.change(folderInput, {
        target: { files: [file1] },
      });

      // Verify ensureFolderPaths is called with parent_path
      await waitFor(() => {
        expect(api.ensureFolderPaths).toHaveBeenCalledWith(
          ['new-folder'],
          'Grandparent/Parent'
        );
      });

      // Verify document is uploaded with full path including base path and renamed folder
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledWith(
          file1,
          'Grandparent/Parent/new-folder (2)/file1.txt'
        );
      });

      // Verify data for the current folder is refetched
      await waitFor(() => {
        expect(api.getFolderContents).toHaveBeenCalledTimes(2);
      });
    });

    it('should allow uploading the same folder twice in a row', async () => {
      renderComponent();

      const file1 = createFolderFile('folderA/file1.txt', 'file1.txt');
      const files = [file1];

      api.ensureFolderPaths.mockResolvedValue({ data: { path_mappings: { folderA: 'folderA' } } });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();

      // First upload
      fireEvent.change(folderInput, { target: { files } });

      await waitFor(() => {
        expect(api.ensureFolderPaths).toHaveBeenCalledTimes(1);
        expect(api.uploadDocument).toHaveBeenCalledTimes(1);
      });

      // Second upload of the same folder
      fireEvent.change(folderInput, { target: { files } });

      await waitFor(() => {
        // The counts should now be double, proving the event fired again
        expect(api.ensureFolderPaths).toHaveBeenCalledTimes(2);
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Selection and Bulk Actions', () => {
    const mockFolders = [
        { id: 'folder1', name: 'Folder One' },
        { id: 'folder2', name: 'Folder Two' },
    ];
    const mockDocuments = [
        { id: 'doc1', name: 'Document One' },
        { id: 'doc2', name: 'Document Two' },
    ];

    beforeEach(() => {
        api.getRootFolderContents.mockResolvedValue({
            data: {
                current_folder: null,
                sub_folders: mockFolders,
                documents: mockDocuments,
            },
        });
        api.deleteMultipleDocuments.mockResolvedValue({ status: 200, value: [] });
        api.deleteMultipleFolders.mockResolvedValue({ status: 200, value: [] });
    });

    it('should show selection bar on item select and hide on clear', async () => {
        const user = userEvent.setup();
        renderComponent();
        
        expect(await screen.findByText('Folder One')).toBeInTheDocument();
        expect(await screen.findByText('Document One')).toBeInTheDocument();

        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

        const checkboxes = screen.getAllByRole('checkbox', { name: 'Select item' });
        await user.click(checkboxes[0]);

        const actionBar = screen.getByText(/1 folder selected/);
        expect(actionBar).toBeInTheDocument();

        await user.click(checkboxes[2]);
        expect(screen.getByText(/1 document, 1 folder selected/)).toBeInTheDocument();

        const clearButton = screen.getByRole('button', { name: 'Clear Selection' });
        await user.click(clearButton);

        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });

    it('should highlight selected items', async () => {
        const user = userEvent.setup();
        renderComponent();

        const folderCard = await screen.findByText('Folder One');
        
        expect(folderCard.closest('div[class*="relative flex"]')).not.toHaveClass('border-primary');

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[0]);
        
        expect(folderCard.closest('div[class*="relative flex"]')).toHaveClass('border-primary');
    });

    it('should select a range of items with shift-click', async () => {
        const user = userEvent.setup();
        renderComponent();

        await screen.findByText('Folder One');
        const checkboxes = screen.getAllByRole('checkbox');

        await user.click(checkboxes[0]);

        await user.keyboard('{Shift>}');
        await user.click(checkboxes[2]);
        await user.keyboard('{/Shift}');

        expect(screen.getByText(/1 document, 2 folders selected/)).toBeInTheDocument();
        
        expect(checkboxes[0]).toBeChecked();
        expect(checkboxes[1]).toBeChecked();
        expect(checkboxes[2]).toBeChecked();
        expect(checkboxes[3]).not.toBeChecked();
    });

    it('should handle bulk delete action', async () => {
        const user = userEvent.setup();
        renderComponent();
        await screen.findByText('Folder One');

        const checkboxes = screen.getAllByRole('checkbox');
        await user.click(checkboxes[1]); // Folder Two
        await user.click(checkboxes[3]); // Document Two

        const bulkDeleteButton = screen.getByRole('button', { name: /delete/i });
        await user.click(bulkDeleteButton);

        expect(await screen.findByText('Delete Selected Items?')).toBeInTheDocument();
        
        const confirmButton = screen.getByRole('button', { name: 'Delete' });
        await user.click(confirmButton);

        await waitFor(() => {
            expect(api.deleteMultipleFolders).toHaveBeenCalledWith(['folder2']);
            expect(api.deleteMultipleDocuments).toHaveBeenCalledWith(['doc2']);
        });

        await waitFor(() => {
            expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
        });
    });
  });

  // describe('Drag and Drop Scenarios', () => {
  //   // Helper to create a file with a mocked path property, mimicking react-dropzone
  //   const createDroppedFile = (path, name) => {
  //     const file = new File(['content'], name, { type: 'text/plain' });
  //     // react-dropzone adds a `path` property.
  //     Object.defineProperty(file, 'path', {
  //       value: path,
  //     });
  //     return file;
  //   };

  //   // Mock what a drop event's dataTransfer object looks like for react-dropzone
  //   const createDropEvent = (files) => {
  //     return {
  //       dataTransfer: {
  //         files: files,
  //       },
  //     };
  //   };

  //   it('should handle a single dropped file', async () => {
  //     api.getRootFolderContents.mockResolvedValue({
  //       data: { current_folder: null, sub_folders: [], documents: [] },
  //     });
  //     renderComponent();
  //     await waitFor(() => {
  //       expect(screen.getByText('No documents yet')).toBeInTheDocument();
  //     });

  //     const droppedFile = createDroppedFile('dropped-file.txt', 'dropped-file.txt');
  //     api.uploadDocument.mockResolvedValue({ status: 202 });

  //     const dropzone = screen.getByText('No documents yet').closest('.space-y-4.relative');
  //     // react-dropzone processes the event and provides `acceptedFiles` to onDrop
  //     // We simulate this by mocking the event that react-dropzone processes
  //     fireEvent.drop(dropzone, createDropEvent([droppedFile]));

  //     await waitFor(() => {
  //       expect(api.createFolderFromPath).not.toHaveBeenCalled();
  //       expect(api.uploadDocument).toHaveBeenCalledTimes(1);
  //     });

  //     const uploadedFile = api.uploadDocument.mock.calls[0][0];
  //     const uploadedPath = api.uploadDocument.mock.calls[0][1];
  //     expect(uploadedFile.name).toBe('dropped-file.txt');
  //     // For root files, the path is just the filename. The backend handles this.
  //     expect(uploadedPath).toBe('dropped-file.txt');

  //     await waitFor(() => {
  //       expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
  //     });
  //   });

  //   it('should correctly normalize and create unique folder paths from dropped items', async () => {
  //     api.getRootFolderContents.mockResolvedValue({
  //       data: { current_folder: null, sub_folders: [], documents: [] },
  //     });
  //     renderComponent();
  //     await waitFor(() => {
  //       expect(screen.getByText('No documents yet')).toBeInTheDocument();
  //     });

  //     const file1 = createDroppedFile('/folder1/file1.txt', 'file1.txt'); // Leading slash
  //     const file2 = createDroppedFile('folder2/sub/file2.txt', 'file2.txt');
  //     const file3 = createDroppedFile('folder1/file3.txt', 'file3.txt'); // Duplicate path

  //     api.createFolderFromPath.mockResolvedValue({ status: 201 });
  //     api.uploadDocument.mockResolvedValue({ status: 202 });

  //     const dropzone = screen.getByText('No documents yet').closest('.space-y-4.relative');
  //     fireEvent.drop(dropzone, createDropEvent([file1, file2, file3]));

  //     // Check folder creation calls (normalized)
  //     await waitFor(() => {
  //       expect(api.createFolderFromPath).toHaveBeenCalledTimes(2);
  //     });
  //     expect(api.createFolderFromPath).toHaveBeenCalledWith('folder1');
  //     expect(api.createFolderFromPath).toHaveBeenCalledWith('folder2/sub');

  //     // Check file upload calls (original paths)
  //     await waitFor(() => {
  //       expect(api.uploadDocument).toHaveBeenCalledTimes(3);
  //     });
  //     expect(api.uploadDocument).toHaveBeenCalledWith(file1, '/folder1/file1.txt');
  //     expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'folder2/sub/file2.txt');
  //     expect(api.uploadDocument).toHaveBeenCalledWith(file3, 'folder1/file3.txt');


  //     // Check data refetch
  //     await waitFor(() => {
  //       expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
  //     });
  //   });
  // });

});
