import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DocumentsPage from '../../pages/DocumentsPage';
import * as api from '../../services/api';

// Mock the api service
vi.mock('../../services/api');

// Mock child components that are not relevant to the test
vi.mock('../../components/documents/DocumentsList', () => ({
  DocumentsList: () => <div>DocumentsList Mock</div>,
}));
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

    it('should call uploadDocument with relative path and refetch on success', async () => {
      renderComponent();

      const file1 = createFolderFile('folderA/file1.txt', 'file1.txt');
      const file2 = createFolderFile('folderA/file2.txt', 'file2.txt');

      api.uploadDocument.mockResolvedValue({ status: 202 });
      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderA/file1.txt');
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'folderA/file2.txt');

      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
        expect(api.getFolders).toHaveBeenCalledTimes(2);
      });
    });

    it('should refetch data if some folder files succeed', async () => {
      renderComponent();

      const file1 = createFolderFile('folderB/success.txt', 'success.txt');
      const file2 = createFolderFile('folderB/fail.txt', 'fail.txt');

      api.uploadDocument
        .mockResolvedValueOnce({ status: 202 })
        .mockRejectedValueOnce(new Error('Upload failed'));

      const folderInput = findFolderInput();

      fireEvent.change(folderInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(api.uploadDocument).toHaveBeenCalledTimes(2);
      });
      expect(api.uploadDocument).toHaveBeenCalledWith(file1, 'folderB/success.txt');
      expect(api.uploadDocument).toHaveBeenCalledWith(file2, 'folderB/fail.txt');

      await waitFor(() => {
        expect(api.getDocuments).toHaveBeenCalledTimes(2);
        expect(api.getFolders).toHaveBeenCalledTimes(2);
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('1 file(s) failed to upload.');
    });
  });
});
