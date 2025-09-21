import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Default successful mock for initial data fetch
    api.getDocuments.mockResolvedValue({ data: [] });
    api.getFolders.mockResolvedValue({ data: [] });

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <DocumentsPage />
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

  it('should render the page and fetch initial data', async () => {
    renderComponent();
    expect(screen.getByText('All Documents')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getDocuments).toHaveBeenCalledTimes(1);
      expect(api.getFolders).toHaveBeenCalledTimes(1);
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
      expect(api.uploadDocument).toHaveBeenCalledWith(file1);
      expect(api.uploadDocument).toHaveBeenCalledWith(file2);

      // getDocuments/getFolders called once initially, then again after successful upload
      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
        expect(api.getFolders).toHaveBeenCalledTimes(2);
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
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
        expect(api.getFolders).toHaveBeenCalledTimes(2);
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
      expect(api.getDocuments).toHaveBeenCalledTimes(1);
      expect(api.getFolders).toHaveBeenCalledTimes(1);

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

    it('should call createFolderFromPath once then uploadDocument for each file', async () => {
      renderComponent();

      const file1 = createFolderFile('folderA/file1.txt', 'file1.txt');
      const file2 = createFolderFile('folderA/file2.txt', 'file2.txt');

      // Mock API calls
      api.createFolderFromPath.mockResolvedValue({ status: 201 });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();

      // Simulate user selecting a folder
      fireEvent.change(folderInput, {
        target: { files: [file1, file2] },
      });

      // Verify folder path is created first
      await waitFor(() => {
        expect(api.createFolderFromPath).toHaveBeenCalledTimes(1);
      });
      expect(api.createFolderFromPath).toHaveBeenCalledWith('folderA');

      // Verify documents are uploaded next
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderA/file1.txt');
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'folderA/file2.txt');

      // Verify data is refetched on success
      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
        expect(api.getFolders).toHaveBeenCalledTimes(2);
      });
    });

    it('should call createFolderFromPath for multiple unique paths in parallel', async () => {
      renderComponent();

      const file1 = createFolderFile('folderA/sub1/file1.txt', 'file1.txt');
      const file2 = createFolderFile('folderB/file2.txt', 'file2.txt');
      const file3 = createFolderFile('folderA/sub1/file3.txt', 'file3.txt'); // duplicate path

      api.createFolderFromPath.mockResolvedValue({ status: 201 });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1, file2, file3] },
      });

      // Verify folder paths are created
      await waitFor(() => {
        expect(api.createFolderFromPath).toHaveBeenCalledTimes(2);
      });
      expect(api.createFolderFromPath).toHaveBeenCalledWith('folderA/sub1');
      expect(api.createFolderFromPath).toHaveBeenCalledWith('folderB');

      // Verify documents are uploaded
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(3);
      });

      // Verify data is refetched
      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
      });
    });

    it('should stop and log error if folder creation fails', async () => {
      renderComponent();

      const file1 = createFolderFile('folderC/file1.txt', 'file1.txt');
      api.createFolderFromPath.mockRejectedValue(new Error('Folder creation failed'));

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1] },
      });

      await waitFor(() => {
        expect(api.createFolderFromPath).toHaveBeenCalledWith('folderC');
      });

      // Ensure uploadDocument is NOT called
      expect(api.uploadDocument).not.toHaveBeenCalled();

      // Ensure data is NOT refetched
      expect(api.getDocuments).toHaveBeenCalledTimes(1);
      expect(api.getFolders).toHaveBeenCalledTimes(1);

      // Ensure error is logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create folder structure:',
        expect.any(Error)
      );
    });
  });

  describe('Drag and Drop Scenarios', () => {
    // Helper to create a file with a mocked webkitRelativePath
    const createFolderFile = (path, name) => {
      const file = new File(['content'], name, { type: 'text/plain' });
      Object.defineProperty(file, 'webkitRelativePath', {
        value: path,
      });
      return file;
    };

    // Mock what a drop event's dataTransfer object looks like for react-dropzone
    const createDropEvent = (files) => {
      return {
        dataTransfer: {
          files: files,
        },
      };
    };

    it('should handle a single dropped file', async () => {
      api.getDocuments.mockResolvedValue({ data: [] });
      api.getFolders.mockResolvedValue({ data: [] });
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('No documents')).toBeInTheDocument();
      });

      const droppedFile = createFolderFile('dropped-file.txt', 'dropped-file.txt');
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const dropzone = screen.getByText('No documents').closest('.space-y-4.relative');
      // react-dropzone processes the event and provides `acceptedFiles` to onDrop
      // We simulate this by mocking the event that react-dropzone processes
      fireEvent.drop(dropzone, createDropEvent([droppedFile]));

      await waitFor(() => {
        expect(api.createFolderFromPath).not.toHaveBeenCalled();
        expect(api.uploadDocument).toHaveBeenCalledTimes(1);
      });

      const uploadedFile = api.uploadDocument.mock.calls[0][0];
      const uploadedPath = api.uploadDocument.mock.calls[0][1];
      expect(uploadedFile.name).toBe('dropped-file.txt');
      // For root files, webkitRelativePath is just the filename. The backend handles this.
      expect(uploadedPath).toBe('dropped-file.txt');

      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle a dropped folder with nested content', async () => {
      api.getDocuments.mockResolvedValue({ data: [] });
      api.getFolders.mockResolvedValue({ data: [] });
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('No documents')).toBeInTheDocument();
      });

      const file1 = createFolderFile('dropped-folder/file1.txt', 'file1.txt');
      const file2 = createFolderFile('dropped-folder/sub/file2.txt', 'file2.txt');

      api.createFolderFromPath.mockResolvedValue({ status: 201 });
      api.uploadDocument.mockResolvedValue({ status: 202 });

      const dropzone = screen.getByText('No documents').closest('.space-y-4.relative');
      fireEvent.drop(dropzone, createDropEvent([file1, file2]));

      // Check folder creation calls
      await waitFor(() => {
        expect(api.createFolderFromPath).toHaveBeenCalledTimes(2);
      });
      expect(api.createFolderFromPath).toHaveBeenCalledWith('dropped-folder');
      expect(api.createFolderFromPath).toHaveBeenCalledWith('dropped-folder/sub');

      // Check file upload calls
      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(expect.any(File), 'dropped-folder/file1.txt');
      expect(api.uploadDocument).toHaveBeenCalledWith(expect.any(File), 'dropped-folder/sub/file2.txt');

      // Check data refetch
      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
      });
    });
  });
});
