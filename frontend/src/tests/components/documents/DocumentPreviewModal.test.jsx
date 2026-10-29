import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentPreviewModal } from '../../../components/documents/DocumentPreviewModal';
import * as api from '../../../services/api';

// Mock API service
vi.mock('../../../services/api');

vi.mock('../../../components/documents/VideoViewer', () => ({
  VideoViewer: ({ onTokenExpired, videoUrl }) => (
    <div data-testid="mock-video-viewer" data-url={videoUrl}>
      <button onClick={onTokenExpired}>Trigger Token Expired</button>
    </div>
  ),
}));

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
    vi.spyOn(api, 'getDocumentPreviewData')
      .mockImplementation(() => {
        return Promise.resolve({ data: mockPendingData });
      });
    vi.spyOn(api, 'rebuildDocumentPreview')
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

  it('renders video preview and refreshes preview data when onTokenExpired is invoked', async () => {
    const mockInitialVideoData = {
      name: 'test_video.mp4',
      preview_status: 'ready',
      preview_mode: 'video',
      video_preview_url: 'https://example.com/stream/playlist.m3u8?token=old',
      download_url: 'https://example.com/download',
    };

    const mockRefreshedVideoData = {
      name: 'test_video.mp4',
      preview_status: 'ready',
      preview_mode: 'video',
      video_preview_url: 'https://example.com/stream/playlist.m3u8?token=refreshed_new',
      download_url: 'https://example.com/download',
    };

    const mockGetPreview = vi.spyOn(api, 'getDocumentPreviewData')
      .mockResolvedValueOnce({ data: mockInitialVideoData })
      .mockResolvedValueOnce({ data: mockRefreshedVideoData });

    render(
      <DocumentPreviewModal
        documentId="video-doc-1"
        isOpen={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetPreview).toHaveBeenCalledTimes(1);
      expect(mockGetPreview).toHaveBeenCalledWith("video-doc-1", null);
    });

    const viewer = screen.getByTestId('mock-video-viewer');
    expect(viewer).toBeInTheDocument();
    expect(viewer.getAttribute('data-url')).toBe('https://example.com/stream/playlist.m3u8?token=old');

    // Simulate token expiration callback from player
    const triggerBtn = screen.getByText('Trigger Token Expired');
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(mockGetPreview).toHaveBeenCalledTimes(2);
      expect(viewer.getAttribute('data-url')).toBe('https://example.com/stream/playlist.m3u8?token=refreshed_new');
    });
  });

  it('displays error message when token refresh fails', async () => {
    const mockInitialVideoData = {
      name: 'test_video.mp4',
      preview_status: 'ready',
      preview_mode: 'video',
      video_preview_url: 'https://example.com/stream/playlist.m3u8?token=old',
      download_url: 'https://example.com/download',
    };

    const mockGetPreview = vi.spyOn(api, 'getDocumentPreviewData')
      .mockResolvedValueOnce({ data: mockInitialVideoData })
      .mockRejectedValueOnce({
        response: { data: { detail: 'Document access has been revoked.' } },
      });

    render(
      <DocumentPreviewModal
        documentId="video-doc-1"
        isOpen={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetPreview).toHaveBeenCalledTimes(1);
    });

    const triggerBtn = screen.getByText('Trigger Token Expired');
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(screen.getByText('Document access has been revoked.')).toBeInTheDocument();
    });
  });

  it('does not write state if modal closes before token refresh completes', async () => {
    const mockInitialVideoData = {
      name: 'test_video.mp4',
      preview_status: 'ready',
      preview_mode: 'video',
      video_preview_url: 'https://example.com/stream/playlist.m3u8?token=old',
    };

    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    const mockGetPreview = vi.spyOn(api, 'getDocumentPreviewData')
      .mockResolvedValueOnce({ data: mockInitialVideoData })
      .mockImplementationOnce(() => refreshPromise);

    const { rerender } = render(
      <DocumentPreviewModal
        documentId="video-doc-1"
        isOpen={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetPreview).toHaveBeenCalledTimes(1);
    });

    const triggerBtn = screen.getByText('Trigger Token Expired');
    fireEvent.click(triggerBtn);

    // Modal is closed while refresh is in flight
    rerender(
      <DocumentPreviewModal
        documentId="video-doc-1"
        isOpen={false}
        onOpenChange={vi.fn()}
      />
    );

    // Now late response resolves
    await act(async () => {
      resolveRefresh({
        data: {
          name: 'stale_video.mp4',
          preview_status: 'ready',
          preview_mode: 'video',
          video_preview_url: 'https://example.com/stream/playlist.m3u8?token=stale',
        },
      });
    });

    // Modal is closed, should not render viewer
    expect(screen.queryByTestId('mock-video-viewer')).toBeNull();
  });
});
