import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../../../i18n';
import { UploadProgressIndicator } from '../../../components/documents/UploadProgressIndicator';
import { useUpload } from '../../../contexts/UploadProvider';

// Mock the useUpload hook to control its return value in tests
vi.mock('../../../contexts/UploadProvider', async () => {
    const original = await vi.importActual('../../../contexts/UploadProvider');
    return {
        ...original,
        useUpload: vi.fn(),
    };
});

const createFile = (name, size) => {
    return new File(['a'.repeat(size)], name, { type: 'text/plain' });
};

const mockUploads = {
    'upload-1': { id: 'upload-1', file: createFile('file1.txt', 100), status: 'uploading', progress: 50, error: null },
    'upload-2': { id: 'upload-2', file: createFile('file2.txt', 200), status: 'uploading', progress: 25, error: null },
};

const mockCompletedUploads = {
    'upload-1': { id: 'upload-1', file: createFile('file1.txt', 100), status: 'complete', progress: 100, error: null },
    'upload-2': { id: 'upload-2', file: createFile('file2.txt', 200), status: 'complete', progress: 100, error: null },
};

const mockErrorUploads = {
    'upload-1': { id: 'upload-1', file: createFile('file1.txt', 100), status: 'complete', progress: 100, error: null },
    'upload-2': { id: 'upload-2', file: createFile('file2.txt', 200), status: 'error', progress: 75, error: 'Network Error' },
};


describe('UploadProgressIndicator', () => {
    let mockClearCompleted;

    beforeEach(() => {
        vi.resetAllMocks();
        mockClearCompleted = vi.fn();
    });

    const renderComponent = (uploads) => {
        useUpload.mockReturnValue({
            uploads: uploads,
            clearCompleted: mockClearCompleted,
        });

        return render(<UploadProgressIndicator />);
    };

    it('should not render if there are no uploads', () => {
        renderComponent({});
        expect(screen.queryByText(/uploading/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/overall progress/i)).not.toBeInTheDocument();
    });

    it('should render and show correct status when uploads are in progress', () => {
        renderComponent(mockUploads);
        expect(screen.getByText('Uploading 2 files...')).toBeInTheDocument();
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('file2.txt')).toBeInTheDocument();
    });

    it('should calculate and display overall progress correctly', () => {
        // file1: 50% of 100 bytes = 50 bytes uploaded
        // file2: 25% of 200 bytes = 50 bytes uploaded
        // Total uploaded: 100 bytes. Total size: 300 bytes.
        // Overall progress: (100 / 300) * 100 = 33.33...%
        renderComponent(mockUploads);
        expect(screen.getByText('33%')).toBeInTheDocument();
    });

    it('should show "All uploads complete!" status when all uploads are successful', () => {
        renderComponent(mockCompletedUploads);
        expect(screen.getByText('All uploads complete!')).toBeInTheDocument();
        expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should show failure status when some uploads have errors', () => {
        renderComponent(mockErrorUploads);
        expect(screen.getByText('1 upload failed.')).toBeInTheDocument();
        expect(screen.getByText('Network Error')).toBeInTheDocument();
    });

    it('should show the close button only when all uploads are finished', () => {
        const { rerender } = renderComponent(mockUploads);
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

        useUpload.mockReturnValue({ uploads: mockCompletedUploads, clearCompleted: mockClearCompleted });
        rerender(<UploadProgressIndicator />);
        
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should call clearCompleted when the close button is clicked', () => {
        renderComponent(mockCompletedUploads);
        const closeButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(closeButton);
        expect(mockClearCompleted).toHaveBeenCalledTimes(1);
    });

    it('should toggle the expanded view when the chevron button is clicked', () => {
        renderComponent(mockUploads);

        // Initially expanded, file list is visible
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        const collapseButton = screen.getByRole('button', { name: /collapse/i });
        fireEvent.click(collapseButton);

        // Now collapsed, file list should not be visible
        expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();
        const expandButton = screen.getByRole('button', { name: /expand/i });

        // Click again to expand
        fireEvent.click(expandButton);
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });
});
