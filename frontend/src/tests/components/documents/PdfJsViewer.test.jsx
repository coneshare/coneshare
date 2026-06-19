import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { PdfJsViewer } from '../../../components/documents/PdfJsViewer';
import { usePdfDocument } from '../../../hooks/usePdfDocument';
import * as api from '../../../services/api';

// Mock hook
vi.mock('../../../hooks/usePdfDocument', () => ({
  usePdfDocument: vi.fn(),
}));

// Mock PdfPage component
vi.mock('../../../components/documents/PdfPage', () => ({
  PdfPage: ({ pageNumber }) => (
    <div data-testid="pdf-page" data-page={pageNumber}>
      Page {pageNumber}
    </div>
  ),
}));

// Mock API service
vi.mock('../../../services/api');

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn();
let intersectionCallback;

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((callback) => {
      intersectionCallback = callback;
      return {
        observe: mockIntersectionObserver,
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    })
  );
});

describe('PdfJsViewer', () => {
  const mockOnPageChange = vi.fn();
  const viewId = 'view_123';
  const pdfUrl = 'https://example.com/test.pdf';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockIntersectionObserver.mockClear();
    intersectionCallback = undefined;

    // Default mock implementation
    usePdfDocument.mockReturnValue({
      pdfDoc: { numPages: 3 },
      numPages: 3,
      pageDimensions: [
        { width: 612, height: 792 },
        { width: 612, height: 792 },
        { width: 612, height: 792 },
      ],
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      pdfUrl,
      title: 'Test PDF',
      viewId: null,
      zoomLevel: 1,
      onPageChange: mockOnPageChange,
    };
    return render(<PdfJsViewer {...defaultProps} {...props} />);
  };

  const getPageElement = (pageNumber) => {
    const pageDiv = screen.getByText(`Page ${pageNumber}`);
    return pageDiv.parentElement;
  };

  const triggerIntersection = (pageNumber, isIntersecting = true, intersectionRatio = 0.8) => {
    if (!intersectionCallback) {
      throw new Error('IntersectionObserver callback not captured');
    }
    const target = getPageElement(pageNumber);
    act(() => {
      intersectionCallback([{ target, isIntersecting, intersectionRatio }]);
    });
  };

  it('should render loading state when hook is loading', () => {
    usePdfDocument.mockReturnValue({
      pdfDoc: null,
      numPages: 0,
      pageDimensions: [],
      loading: true,
      error: null,
    });

    const { container } = renderComponent();
    expect(container.textContent).not.toContain('Page 1');
    expect(screen.queryAllByTestId('pdf-page')).toHaveLength(0);
  });

  it('should render error state when hook has error', () => {
    usePdfDocument.mockReturnValue({
      pdfDoc: null,
      numPages: 0,
      pageDimensions: [],
      loading: false,
      error: new Error('Failed to load PDF file'),
    });

    renderComponent();
    expect(screen.getByText('Failed to load preview')).toBeInTheDocument();
    expect(screen.getByText('Failed to load PDF file')).toBeInTheDocument();
  });

  it('should render all pages correctly', () => {
    renderComponent();
    expect(screen.getAllByTestId('pdf-page')).toHaveLength(3);
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText('Page 3')).toBeInTheDocument();
  });

  it('should call onPageChange when a new page becomes visible', () => {
    renderComponent();
    triggerIntersection(2);
    expect(mockOnPageChange).toHaveBeenCalledWith(2);
  });

  it('should track active viewing time per page when viewId is provided', () => {
    const { unmount } = renderComponent({ viewId });

    act(() => {
      vi.advanceTimersByTime(5000); // 5 seconds on page 1
    });

    unmount();

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 1, duration_seconds: 5 },
      false
    );
  });

  it('should pause tracking on user inactivity and resume on activity', () => {
    const { unmount } = renderComponent({ viewId });
    const INACTIVITY_TIMEOUT = 60000;

    // 10 seconds active
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Inactivity fires
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT);
    });

    // 5 more seconds inactive
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Activity triggered
    fireEvent.mouseMove(document.body);

    // 5 more seconds active
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    unmount();

    // Total active: 60s (before inactivity) + 5s (after activity) = 65s
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ duration_seconds: 65 }),
      false
    );
  });

  it('should send tracking data when page changes', () => {
    renderComponent({ viewId });

    act(() => {
      vi.advanceTimersByTime(8000); // 8 seconds page 1
    });

    triggerIntersection(2);

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 1, duration_seconds: 8 },
      false
    );
    expect(mockOnPageChange).toHaveBeenCalledWith(2);

    act(() => {
      vi.advanceTimersByTime(4000); // 4 seconds page 2
    });

    triggerIntersection(2, false, 0);
    triggerIntersection(3);

    expect(api.recordPageView).toHaveBeenCalledTimes(2);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 2, duration_seconds: 4 },
      false
    );
    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });
});
