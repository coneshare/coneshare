import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as BreadcrumbProvider from '../../components/layout/BreadcrumbProvider';
import { UploadProvider } from '../../contexts/UploadProvider';
import { useUser } from '../../contexts/UserProvider';
import DocumentsPage from '../../pages/DocumentsPage';
import * as api from '../../services/api';

// Mock the api service
vi.mock('../../services/api');

// Mock the UserProvider context
vi.mock('../../contexts/UserProvider', () => ({
  useUser: vi.fn(),
}));

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
    api.getCloudProviders.mockResolvedValue({ data: [] });
    api.getCloudConnections.mockResolvedValue({ data: [] });

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock the useBreadcrumb hook
    mockSetBreadcrumbData = vi.fn();
    vi.spyOn(BreadcrumbProvider, 'useBreadcrumb').mockReturnValue({
      setBreadcrumbData: mockSetBreadcrumbData,
    });

    // Mock useUser to return a default user object
    useUser.mockReturnValue({
      user: {
        id: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        max_files_per_upload: 100, // Default generous limit
      },
    });
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  const renderComponent = (route = '/documents') => {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <UploadProvider>
          <Routes>
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/folders/:folderId" element={<DocumentsPage />} />
          </Routes>
        </UploadProvider>
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
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'file1.txt', expect.any(Function));
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'file2.txt', expect.any(Function));

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
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('File upload failed for id'),
          expect.any(Error)
        );
      });      
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

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('File upload failed for id'),
        expect.any(Error)
      );      
    });

    it('should upload a single file to the current subfolder', async () => {
      const parentFolderId = 'folder123';
      const mockCurrentFolder = {
        id: parentFolderId,
        name: 'Subfolder',
        ancestors: [{ id: 'parent', name: 'Parent' }],
      };
      api.getFolderContents.mockResolvedValue({
        data: { current_folder: mockCurrentFolder, sub_folders: [], documents: [] },
      });

      renderComponent(`/documents/folders/${parentFolderId}`);
      await waitFor(() => expect(api.getFolderContents).toHaveBeenCalledWith(parentFolderId));

      const file = createFile('test-file.txt');
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const fileInput = findFileInput();
      fireEvent.change(fileInput, {
        target: { files: [file] },
      });

      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(1);
      });
      // The constructed path should be ancestors + current_folder + filename
      expect(api.uploadDocument).toHaveBeenCalledWith(file, 'Parent/Subfolder/test-file.txt', expect.any(Function));

      // Verify data for the current folder is refetched
      await waitFor(() => {
        expect(api.getFolderContents).toHaveBeenCalledTimes(2);
      });
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
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderA/file1.txt', expect.any(Function));
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'folderA/file2.txt', expect.any(Function));

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
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, '/folderA/sub1/file1.txt', expect.any(Function));

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
        expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderA (2)/file1.txt', expect.any(Function));
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
          'Grandparent/Parent/new-folder (2)/file1.txt',
          expect.any(Function)
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

  describe('Upload Limits', () => {
    beforeEach(() => {
      // Set a strict limit for these tests
      useUser.mockReturnValue({
        user: { max_files_per_upload: 2 },
      });
    });

    it('should block multi-file upload if it exceeds the limit', async () => {
      renderComponent();

      const file1 = createFile('file1.txt');
      const file2 = createFile('file2.txt');
      const file3 = createFile('file3.txt');

      const fileInput = findFileInput();

      // Simulate user selecting too many files
      fireEvent.change(fileInput, {
        target: { files: [file1, file2, file3] },
      });

      // Verify that no upload API calls were made
      await waitFor(() => {
        expect(api.uploadDocument).not.toHaveBeenCalled();
      });

      // Verify an error toast is shown
      expect(await screen.findByText('Uploads are limited to 2 files at a time.')).toBeInTheDocument();
    });

    it('should block folder upload if it exceeds the limit', async () => {
      const createFolderFile = (path, name) => {
        const file = new File(['content'], name, { type: 'text/plain' });
        Object.defineProperty(file, 'webkitRelativePath', { value: path });
        return file;
      };

      renderComponent();

      const file1 = createFolderFile('folderA/file1.txt', 'file1.txt');
      const file2 = createFolderFile('folderA/file2.txt', 'file2.txt');
      const file3 = createFolderFile('folderA/file3.txt', 'file3.txt');

      const folderInput = findFolderInput();
      fireEvent.change(folderInput, {
        target: { files: [file1, file2, file3] },
      });

      // Verify no folder or file creation calls were made
      await waitFor(() => {
        expect(api.ensureFolderPaths).not.toHaveBeenCalled();
        expect(api.uploadDocument).not.toHaveBeenCalled();
      });

      // Verify an error toast is shown
      expect(await screen.findByText('Uploads are limited to 2 files at a time.')).toBeInTheDocument();
    });

    it('should allow upload if the number of files is within the limit', async () => {
      renderComponent();

      const file1 = createFile('file1.txt');
      const file2 = createFile('file2.txt');
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const fileInput = findFileInput();
      fireEvent.change(fileInput, {
        target: { files: [file1, file2] },
      });

      // Verify that upload API calls were made
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });

      // Verify no error toast was shown for the limit
      expect(screen.queryByText('Uploads are limited to 2 files at a time.')).not.toBeInTheDocument();
    });

    it('should block upload if user data is not yet loaded', async () => {
      // Mock useUser to return null initially
      useUser.mockReturnValue({ user: null });
      renderComponent();

      const file1 = createFile('file1.txt');
      const fileInput = findFileInput();

      fireEvent.change(fileInput, {
        target: { files: [file1] },
      });

      // Verify that no upload API calls were made
      await waitFor(() => {
        expect(api.uploadDocument).not.toHaveBeenCalled();
      });

      // Verify an error toast is shown about user data loading
      expect(await screen.findByText('User information is still loading. Please wait a moment and try again.')).toBeInTheDocument();
    });

  });

  describe('Single Item Actions', () => {
    const mockFolders = [{ id: 'folder1', name: 'Folder One', type: 'folder' }];
    const mockDocuments = [{ id: 'doc1', name: 'Document One', type: 'document' }];

    beforeEach(() => {
        api.getRootFolderContents.mockResolvedValue({
            data: {
                current_folder: null,
                sub_folders: mockFolders,
                documents: mockDocuments,
            },
        });
        api.renameFolder.mockResolvedValue({});
        api.deleteDocument.mockResolvedValue({});
    });

    it('should rename a folder via the item menu and refresh', async () => {
        const user = userEvent.setup();
        renderComponent();
        
        const folderRow = await screen.findByText('Folder One').then(el => el.closest('[data-testid^="draggable-item-"]'));
        const menuTrigger = within(folderRow).getByRole('button', { name: /actions for/i });
        await user.click(menuTrigger);

        const renameMenuItem = await screen.findByRole('menuitem', { name: /rename/i });
        await user.click(renameMenuItem);

        const dialog = await screen.findByRole('dialog', { name: /rename folder/i });
        const input = within(dialog).getByLabelText('Name');
        await user.clear(input);
        await user.type(input, 'Renamed Folder');
        await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

        await waitFor(() => {
            expect(api.renameFolder).toHaveBeenCalledWith('folder1', 'Renamed Folder');
        });

        await waitFor(() => {
            expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
        });
    });

    it('should delete a document via the item menu and refresh', async () => {
        const user = userEvent.setup();
        renderComponent();
        
        const docRow = await screen.findByText('Document One').then(el => el.closest('[data-testid^="draggable-item-"]'));
        const menuTrigger = within(docRow).getByRole('button', { name: /actions for/i });
        await user.click(menuTrigger);

        const deleteMenuItem = await screen.findByRole('menuitem', { name: /delete/i });
        await user.click(deleteMenuItem);

        const dialog = await screen.findByRole('dialog', { name: /delete "Document One"\?/i });
        await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(api.deleteDocument).toHaveBeenCalledWith('doc1');
        });

        await waitFor(() => {
            expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
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
        api.deleteMultipleDocuments.mockResolvedValue([]);
        api.deleteMultipleFolders.mockResolvedValue([]);
    });

    it('should show selection bar on item select and hide on clear', async () => {
        const user = userEvent.setup();
        renderComponent();
        
        expect(await screen.findByText('Folder One')).toBeInTheDocument();
        expect(await screen.findByText('Document One')).toBeInTheDocument();

        expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

        await user.click(screen.getByText('Folder One').closest('[data-testid^="draggable-item-"]'));

        const actionBar = await screen.findByRole('button', { name: 'Clear Selection' }).then(btn => btn.closest('div'));
        expect(actionBar).toHaveTextContent('1 folder selected');

        await user.keyboard('{Meta>}');
        await user.click(screen.getByText('Document One').closest('[data-testid^="draggable-item-"]'));
        await user.keyboard('{/Meta}');
        expect(actionBar).toHaveTextContent('1 document, 1 folder selected');      
    });

    it('should highlight selected items', async () => {
        const user = userEvent.setup();
        renderComponent();

        const folderCard = await screen.findByText('Folder One');
        const itemRow = folderCard.closest('[data-testid^="draggable-item-"]');
        
        expect(itemRow).not.toHaveClass('bg-blue-50');

        await user.click(itemRow);
        
        expect(itemRow).toHaveClass('bg-blue-50');
    });

    it('should select a range of items with shift-click', async () => {
        const user = userEvent.setup();
        renderComponent();

        await screen.findByText('Folder One');

        const folderOneRow = screen.getByText('Folder One').closest('[data-testid^="draggable-item-"]');
        const documentOneRow = screen.getByText('Document One').closest('[data-testid^="draggable-item-"]');

        await user.click(folderOneRow);

        await user.keyboard('{Shift>}');
        await user.click(documentOneRow);
        await user.keyboard('{/Shift}');

        // This selects Folder One, Folder Two, and Document One (2 folders, 1 document)
        const actionBar = screen.getByRole('button', { name: 'Clear Selection' }).closest('div');
        expect(actionBar).toHaveTextContent('1 document, 2 folders selected');

        expect(folderOneRow).toHaveClass('bg-blue-50');
    });

    it('should handle bulk delete action', async () => {
        const user = userEvent.setup();
        renderComponent();
        await screen.findByText('Folder One');

        await user.click(screen.getByText('Folder Two').closest('[data-testid^="draggable-item-"]'));
        await user.keyboard('{Meta>}');
        await user.click(screen.getByText('Document Two').closest('[data-testid^="draggable-item-"]'));
        await user.keyboard('{/Meta}');

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
            // 1. fetch and display the initial list
            // 2. refresh the data after deletion
            expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
        });
    });
  });

  describe('Move Items', () => {
    const mockFolders = [
        { id: 'folder1', name: 'Folder One' }, // To be moved
        { id: 'folder2', name: 'Folder Two' }, // Destination
    ];
    const mockDocuments = [
        { id: 'doc1', name: 'Document One' }, // To be moved
    ];

    beforeEach(() => {
        // Mock data for the main DocumentsPage list
        api.getRootFolderContents.mockResolvedValue({
            data: {
                current_folder: null,
                sub_folders: mockFolders,
                documents: mockDocuments,
            },
        });
        // Mock data for the MoveItemsDialog's initial fetch (root)
        // We need to do this because the dialog re-fetches folder content
        api.getFolderContents.mockResolvedValue({
            data: {
                current_folder: null,
                sub_folders: mockFolders,
            },
        });
        api.moveItems.mockResolvedValue({ status: 200, data: {} });
    });

    it('should open move dialog, allow moving items, and refresh list on success', async () => {
        const user = userEvent.setup();
        renderComponent();
        
        await screen.findByText('Folder One');

        // Select 'Folder One' and 'Document One' to move
        await user.click(screen.getByText('Folder One').closest('[data-testid^="draggable-item-"]'));
        await user.keyboard('{Meta>}');
        await user.click(screen.getByText('Document One').closest('[data-testid^="draggable-item-"]'));
        await user.keyboard('{/Meta}');

        // Click the "Move" button in the action bar
        const moveButton = screen.getByRole('button', { name: /move/i });
        await user.click(moveButton);

        // Verify the dialog opens
        const dialogTitle = await screen.findByRole('heading', { name: /move items/i });
        const dialog = dialogTitle.closest('div[role="dialog"]');

        // In the dialog, the folder being moved ('Folder One') should be disabled
        const folderOneInDialog = await within(dialog).findByText('Folder One');
        expect(folderOneInDialog.closest('button')).toBeDisabled();

        // The destination folder ('Folder Two') should be enabled
        const folderTwoInDialog = within(dialog).getByText('Folder Two');
        expect(folderTwoInDialog.closest('button')).not.toBeDisabled();

        // Simulate navigating into 'Folder Two'
        api.getFolderContents.mockResolvedValue({
            data: {
                current_folder: { id: 'folder2', name: 'Folder Two', ancestors: [] },
                sub_folders: [], // No subfolders inside destination
            },
        });
        await user.click(folderTwoInDialog);

        // Wait for breadcrumb to show we are inside "Folder Two"
        await within(dialog).findByText('Folder Two', { selector: 'span.font-semibold' });

        // Confirm the move
        const moveHereButton = within(dialog).getByRole('button', { name: /move here/i });
        await user.click(moveHereButton);

        // Verify the API was called correctly
        await waitFor(() => {
            expect(api.moveItems).toHaveBeenCalledWith({
                documentIds: ['doc1'],
                folderIds: ['folder1'],
                destinationFolderId: 'folder2',
            });
        });

        // Verify the dialog is closed and the main list is refreshed
        expect(screen.queryByRole('heading', { name: /move items/i })).not.toBeInTheDocument();
        await waitFor(() => {
            // Initial call + dialog open call + refresh call after move
            expect(api.getRootFolderContents).toHaveBeenCalledTimes(3);
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

  describe('Star/Unstar Action', () => {
    const mockFolder = { id: 'folder1', name: 'My Folder', is_starred: false };
    const mockDocument = { id: 'doc1', name: 'My Document', is_starred: false };

    beforeEach(() => {
      api.getRootFolderContents.mockResolvedValue({
        data: {
          current_folder: null,
          sub_folders: [mockFolder],
          documents: [mockDocument],
        },
      });
      api.updateFolder.mockResolvedValue({ data: {} });
      api.updateDocument.mockResolvedValue({ data: {} });
    });

    it('optimistically stars a folder and calls the API', async () => {
      const user = userEvent.setup();
      renderComponent();

      const folderCard = await screen.findByText('My Folder');
      const card = folderCard.closest('[data-testid^="draggable-item-"]');
      const starButton = within(card).getByRole('button', { name: 'Star My Folder' });
      
      await user.click(starButton);

      await waitFor(() => {
        expect(within(card).getByRole('button', { name: 'Unstar My Folder' })).toBeInTheDocument();
      });

      expect(api.updateFolder).toHaveBeenCalledWith('folder1', { is_starred: true });
    });

    it('optimistically unstars a document and calls the API', async () => {
      api.getRootFolderContents.mockResolvedValue({
        data: {
          current_folder: null,
          sub_folders: [],
          documents: [{ id: 'doc1', name: 'My Document', is_starred: true }],
        },
      });
      const user = userEvent.setup();
      renderComponent();

      const docCard = await screen.findByText('My Document');
      const card = docCard.closest('[data-testid^="draggable-item-"]');
      const unstarButton = within(card).getByRole('button', { name: 'Unstar My Document' });

      await user.click(unstarButton);

      await waitFor(() => {
        expect(within(card).getByRole('button', { name: 'Star My Document' })).toBeInTheDocument();
      });

      expect(api.updateDocument).toHaveBeenCalledWith('doc1', { is_starred: false });
    });

    it('reverts the UI and shows a toast if the API call fails', async () => {
      api.updateDocument.mockRejectedValue(new Error('API Error'));
      const user = userEvent.setup();
      renderComponent();

      const docCard = await screen.findByText('My Document');
      const card = docCard.closest('[data-testid^="draggable-item-"]');
      const starButton = within(card).getByRole('button', { name: 'Star My Document' });

      await user.click(starButton);

      // The API call is made, and since it rejects synchronously, the UI may not have time
      // to render the intermediate optimistic state before reverting.
      // We verify the API call was made and then check the final reverted state.
      expect(api.updateDocument).toHaveBeenCalledWith('doc1', { is_starred: true });

      // Revert on failure
      await waitFor(() => {
        expect(within(card).getByRole('button', { name: 'Star My Document' })).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to update star for "My Document"./)).toBeInTheDocument();
      });
    });
  });

  describe('Starred Filter', () => {
    const mockFolders = [
      { id: 'folder1', name: 'Starred Folder', is_starred: true },
      { id: 'folder2', name: 'Normal Folder', is_starred: false },
    ];
    const mockDocuments = [
      { id: 'doc1', name: 'Starred Document', is_starred: true },
      { id: 'doc2', name: 'Normal Document', is_starred: false },
    ];

    beforeEach(() => {
      api.getRootFolderContents.mockResolvedValue({
        data: {
          current_folder: null,
          sub_folders: mockFolders,
          documents: mockDocuments,
        },
      });
    });

    it('should show all items by default', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Starred Folder')).toBeInTheDocument();
        expect(screen.getByText('Normal Folder')).toBeInTheDocument();
        expect(screen.getByText('Starred Document')).toBeInTheDocument();
        expect(screen.getByText('Normal Document')).toBeInTheDocument();
      });
    });

    it('should filter to show only starred items when "Starred" button is clicked', async () => {
      const user = userEvent.setup();
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Starred Folder')).toBeInTheDocument();
      });

      const starredButton = screen.getByRole('button', { name: 'Starred', exact: true });
      await user.click(starredButton);

      await waitFor(() => {
        expect(screen.getByText('Starred Folder')).toBeInTheDocument();
        expect(screen.getByText('Starred Document')).toBeInTheDocument();
        expect(screen.queryByText('Normal Folder')).not.toBeInTheDocument();
        expect(screen.queryByText('Normal Document')).not.toBeInTheDocument();
      });
    });

    it('should toggle back to show all items when "Starred" button is clicked again', async () => {
      const user = userEvent.setup();
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Starred Folder')).toBeInTheDocument();
      });

      const starredButton = screen.getByRole('button', { name: 'Starred', exact: true });

      // Click once to filter
      await user.click(starredButton);
      await waitFor(() => {
        expect(screen.queryByText('Normal Folder')).not.toBeInTheDocument();
      });

      // Click again to un-filter
      await user.click(starredButton);
      await waitFor(() => {
        expect(screen.getByText('Starred Folder')).toBeInTheDocument();
        expect(screen.getByText('Normal Folder')).toBeInTheDocument();
        expect(screen.getByText('Starred Document')).toBeInTheDocument();
        expect(screen.getByText('Normal Document')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('should sort folders by "last modified" date', async () => {
      const user = userEvent.setup();
      const mockFolders = [
        { id: 'f1', name: 'Old Folder', updated_at: '2023-01-01T12:00:00Z', type: 'folder' },
        { id: 'f2', name: 'New Folder', updated_at: '2023-01-02T12:00:00Z', type: 'folder' },
      ];
      api.getRootFolderContents.mockResolvedValue({
        data: { current_folder: null, sub_folders: mockFolders, documents: [] },
      });
      renderComponent();

      await screen.findByText('Old Folder');

      // Open sort menu and select "Last modified"
      await user.click(screen.getByRole('button', { name: /Last Modified/i }));

      // Default sort is ascending, so "Old Folder" should be first.
      let listItems = screen.getAllByText(/Folder/);
      expect(listItems[0]).toHaveTextContent('Old Folder');
      expect(listItems[1]).toHaveTextContent('New Folder');

      // Click again to sort descending
      await user.click(screen.getByRole('button', { name: /Last Modified/i }));

      // Now "New Folder" should be first
      listItems = screen.getAllByText(/Folder/);
      expect(listItems[0]).toHaveTextContent('New Folder');
      expect(listItems[1]).toHaveTextContent('Old Folder');
    });

    it('should sort documents by file size', async () => {
      const user = userEvent.setup();
      const mockDocuments = [
        { id: 'd1', name: 'Small Doc', file_size: 100, updated_at: '2023-01-01T12:00:00Z' },
        { id: 'd2', name: 'Large Doc', file_size: 1000, updated_at: '2023-01-02T12:00:00Z' },
      ];
      api.getRootFolderContents.mockResolvedValue({
        data: { current_folder: null, sub_folders: [], documents: mockDocuments },
      });
      renderComponent();

      await screen.findByText('Small Doc');

      // Open sort menu and select "Size"
      await user.click(screen.getByRole('button', { name: /Size/i }));

      // Default sort is ascending, so "Small Doc" should be first.
      let listItems = screen.getAllByText(/Doc/);
      expect(listItems[0]).toHaveTextContent('Small Doc');
      expect(listItems[1]).toHaveTextContent('Large Doc');

      // Click again to sort descending
      await user.click(screen.getByRole('button', { name: /Size/i }));

      // Now "Large Doc" should be first
      listItems = screen.getAllByText(/Doc/);
      expect(listItems[0]).toHaveTextContent('Large Doc');
      expect(listItems[1]).toHaveTextContent('Small Doc');
    });
  });
});
