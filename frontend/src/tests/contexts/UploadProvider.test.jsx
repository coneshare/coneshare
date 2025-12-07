import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadProvider, useUpload } from '../../contexts/UploadProvider';

// Helper to create mock files
const createFile = (name, size) => {
    return new File(['a'.repeat(size)], name, { type: 'text/plain' });
};

describe('UploadProvider', () => {
    let wrapper;

    beforeEach(() => {
        // The wrapper provides the Provider to the hook for each test
        wrapper = ({ children }) => <UploadProvider>{children}</UploadProvider>;
    });

    it('should initialize with an empty uploads object', () => {
        const { result } = renderHook(() => useUpload(), { wrapper });
        expect(result.current.uploads).toEqual({});
    });

    it('should add new uploads correctly', () => {
        const { result } = renderHook(() => useUpload(), { wrapper });
        const files = [createFile('file1.txt', 100), createFile('file2.txt', 200)];

        let fileIdMap;
        act(() => {
            fileIdMap = result.current.addUploads(files);
        });

        const uploadValues = Object.values(result.current.uploads);
        expect(uploadValues).toHaveLength(2);

        expect(uploadValues[0].file.name).toBe('file1.txt');
        expect(uploadValues[0].status).toBe('uploading');
        expect(uploadValues[0].progress).toBe(0);
        expect(uploadValues[0].id).toBeDefined();

        expect(uploadValues[1].file.name).toBe('file2.txt');

        expect(fileIdMap.get(files[0])).toBe(uploadValues[0].id);
        expect(fileIdMap.get(files[1])).toBe(uploadValues[1].id);
    });

    it('should update an existing upload', () => {
        const { result } = renderHook(() => useUpload(), { wrapper });
        const files = [createFile('file1.txt', 100)];
        
        let fileIdMap;
        act(() => {
            fileIdMap = result.current.addUploads(files);
        });
        
        const uploadId = fileIdMap.get(files[0]);

        act(() => {
            result.current.updateUpload(uploadId, { progress: 50, status: 'uploading' });
        });

        expect(result.current.uploads[uploadId].progress).toBe(50);
        expect(result.current.uploads[uploadId].status).toBe('uploading');

        act(() => {
            result.current.updateUpload(uploadId, { progress: 100, status: 'complete' });
        });

        expect(result.current.uploads[uploadId].progress).toBe(100);
        expect(result.current.uploads[uploadId].status).toBe('complete');
    });

    it('should not throw an error when updating a non-existent upload', () => {
        const { result } = renderHook(() => useUpload(), { wrapper });

        act(() => {
            // This should not cause a crash
            result.current.updateUpload('non-existent-id', { progress: 50 });
        });

        expect(result.current.uploads).toEqual({});
    });

    it('should clear completed and errored uploads but keep active ones', () => {
        const { result } = renderHook(() => useUpload(), { wrapper });
        const files = [
            createFile('uploading.txt', 100),
            createFile('complete.txt', 100),
            createFile('error.txt', 100),
        ];

        let fileIdMap;
        act(() => {
            fileIdMap = result.current.addUploads(files);
        });

        const uploadingId = fileIdMap.get(files[0]);
        const completeId = fileIdMap.get(files[1]);
        const errorId = fileIdMap.get(files[2]);

        act(() => {
            result.current.updateUpload(uploadingId, { status: 'uploading', progress: 50 });
            result.current.updateUpload(completeId, { status: 'complete', progress: 100 });
            result.current.updateUpload(errorId, { status: 'error', progress: 20 });
        });
        
        expect(Object.keys(result.current.uploads)).toHaveLength(3);

        act(() => {
            result.current.clearCompleted();
        });

        const remainingUploads = Object.values(result.current.uploads);
        expect(remainingUploads).toHaveLength(1);
        expect(remainingUploads[0].id).toBe(uploadingId);
        expect(remainingUploads[0].status).toBe('uploading');
    });

    describe('beforeunload event listener', () => {
        let addSpy;
        let removeSpy;
        
        beforeEach(() => {
            addSpy = vi.spyOn(window, 'addEventListener');
            removeSpy = vi.spyOn(window, 'removeEventListener');
        });
        
        afterEach(() => {
            addSpy.mockRestore();
            removeSpy.mockRestore();
        });

        it('should add event listener on mount and remove on unmount', () => {
            const { unmount } = renderHook(() => useUpload(), { wrapper });
            
            expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
            
            unmount();
            
            expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
        });

        it('should trigger preventDefault when an upload is in progress', () => {
            const { result } = renderHook(() => useUpload(), { wrapper });
            
            // Add an active upload
            act(() => {
                result.current.addUploads([createFile('test.txt', 100)]);
            });

            // The useEffect re-runs, so we grab the latest attached handler
            const eventHandler = addSpy.mock.lastCall[1];
            const mockEvent = {
                preventDefault: vi.fn(),
                returnValue: '',
            };

            eventHandler(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalledTimes(1);
            expect(mockEvent.returnValue).toBe('');
        });

        it('should not trigger preventDefault when no uploads are in progress', () => {
            // Render with no uploads
            renderHook(() => useUpload(), { wrapper });
            
            const eventHandler = addSpy.mock.calls[0][1];
            const mockEvent = {
                preventDefault: vi.fn(),
                returnValue: '',
            };

            eventHandler(mockEvent);
            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });

        it('should not trigger preventDefault when all uploads are complete', () => {
            const { result } = renderHook(() => useUpload(), { wrapper });
            
            let files;
            act(() => {
                files = [createFile('test.txt', 100)];
                result.current.addUploads(files);
            });
            
            const uploadId = Object.keys(result.current.uploads)[0];

            act(() => {
                result.current.updateUpload(uploadId, { status: 'complete' });
            });
            
            const eventHandler = addSpy.mock.lastCall[1];
            const mockEvent = {
                preventDefault: vi.fn(),
                returnValue: '',
            };

            eventHandler(mockEvent);
            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });
    });
});
