import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentPreviewModal } from '../../../components/documents/DocumentPreviewModal';
import * as api from '../../../services/api';

// Mock API service
vi.mock('../../../services/api');

describe('DocumentPreviewModal', () => {
  const mockFailedData = {
    name: 'test_file.pdf',
    preview_status: 'failed',
    preview_mode: 'image',
    download_url: 'https://example.com/download',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets rebuildTriggerCount when context changes to prevent unwanted force rebuilds', async () => {
    // 1. Mock getDocumentPreviewData and rebuildDocumentPreview
    const mockGetPreview = vi.spyOn(api, 'getDocumentPreviewData')
      .mockImplementation(() => {
        return Promise.resolve({ data: mockFailedData });
      });
    const mockRebuildPreview = vi.spyOn(api, 'rebuildDocumentPreview')
      .mockImplementation(() => {
        return Promise.resolve({ data: { preview_status: 'not_generated' } });
      });

    // 2. Render modal with isOpen = true, documentId = "doc1"
    const mockOnOpenChange = vi.fn();
    const { rerender } = render(
      <DocumentPreviewModal
        documentId="doc1"
        isOpen={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(mockGetPreview).toHaveBeenCalledWith("doc1", null);
    });

    // Click "Retry generation" which shows up on failure
    const retryButton = await screen.findByText('Retry generation');
    fireEvent.click(retryButton);

    // Verify it triggers rebuildDocumentPreview POST call
    await waitFor(() => {
      expect(mockRebuildPreview).toHaveBeenCalledWith("doc1", null);
    });

    // Clear call history to make assertions cleaner
    mockGetPreview.mockClear();
    mockRebuildPreview.mockClear();

    // 3. Simulate switching documents by rerendering with documentId = "doc2"
    rerender(
      <DocumentPreviewModal
        documentId="doc2"
        isOpen={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    // Wait for the fetch of the new document
    await waitFor(() => {
      // Assert that it called API
      expect(mockGetPreview).toHaveBeenCalledWith("doc2", null);
      // Assert that it did NOT trigger a force rebuild POST
      expect(mockRebuildPreview).not.toHaveBeenCalled();
    });
  });

  it('shows retry button only after 60 seconds of pending, and hides it immediately upon retry', async () => {
    vi.useFakeTimers();

    const mockPendingData = {
      name: 'test_file.pdf',
      preview_status: 'processing',
      preview_mode: 'image',
      download_url: 'https://example.com/download',
    };

    // 1. Mock API calls
    const mockGetPreview = vi.spyOn(api, 'getDocumentPreviewData')
      .mockImplementation(() => {
        return Promise.resolve({ data: mockPendingData });
      });
    const mockRebuildPreview = vi.spyOn(api, 'rebuildDocumentPreview')
      .mockImplementation(() => {
        return Promise.resolve({ data: { preview_status: 'not_generated' } });
      });

    // 2. Render modal
    const mockOnOpenChange = vi.fn();
    render(
      <DocumentPreviewModal
        documentId="doc1"
        isOpen={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    // Wait for initial load trigger to execute
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    // The retry button should NOT be visible initially
    expect(screen.queryByText('Retry generation')).toBeNull();

    // Fast-forward by 59 seconds
    await act(async () => {
      vi.advanceTimersByTime(59000);
    });
    expect(screen.queryByText('Retry generation')).toBeNull();

    // Fast-forward to 60 seconds
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Now the retry button should be visible
    const retryButton = screen.getByText('Retry generation');
    expect(retryButton).toBeInTheDocument();

    // Click retry
    await act(async () => {
      fireEvent.click(retryButton);
    });

    // Flush the microtask queue for rebuildDocumentPreview promise resolution
    await act(async () => {
      await Promise.resolve();
    });

    // Flush again to allow the PreviewStatePanel's useEffect state update to commit
    await act(async () => {
      await Promise.resolve();
    });

    // The retry button should instantly disappear because the status transition resets the timer
    expect(screen.queryByText('Retry generation')).toBeNull();

    // Advance by 3 seconds so the poll timer fires and transitions status back to processing
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Flush the microtask queue for the poll response promise resolution
    await act(async () => {
      await Promise.resolve();
    });

    // Fast-forward by 59 seconds - button should still be hidden (total 62s since click, 59s since processing start)
    await act(async () => {
      vi.advanceTimersByTime(59000);
    });
    expect(screen.queryByText('Retry generation')).toBeNull();

    // Reach 60 seconds of processing (total 63s since click, 60s since processing start) - button reappears
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Retry generation')).toBeInTheDocument();
  });
});
