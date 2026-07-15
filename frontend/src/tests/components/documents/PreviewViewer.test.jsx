import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { PreviewViewer } from '../../../components/documents/PreviewViewer';
import * as api from '../../../services/api';

// Mock child components
vi.mock('../../../components/documents/LazyImage', () => ({
  LazyImage: ({ src, alt }) => <img src={src} alt={alt} data-testid="lazy-image" />,
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

describe('PreviewViewer', () => {
  const mockDocumentData = {
    pages: [
      { page_number: 1, url: '/page1.png' },
      { page_number: 2, url: '/page2.png' },
      { page_number: 3, url: '/page3.png' },
    ],
  };
  const mockOnPageChange = vi.fn();
  const viewId = 'view_123';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset observer mock state for each test
    mockIntersectionObserver.mockClear();
    intersectionCallback = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      documentData: mockDocumentData,
      zoomLevel: 1,
      onPageChange: mockOnPageChange,
      viewId: null,
    };
    return render(<PreviewViewer {...defaultProps} {...props} />);
  };

  const getPageElement = (pageNumber) => {
    // Our mock LazyImage doesn't have the dataset, so we find the parent div.
    const image = screen.getByAltText(`Page ${pageNumber}`);
    return image.parentElement;
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

  it('should render all pages from documentData', () => {
    renderComponent();
    expect(screen.getAllByTestId('lazy-image')).toHaveLength(3);
    expect(screen.getByAltText('Page 1')).toBeInTheDocument();
    expect(screen.getByAltText('Page 2')).toBeInTheDocument();
    expect(screen.getByAltText('Page 3')).toBeInTheDocument();
  });

  it('should not reset scroll when the same document receives a fresh pages array', () => {
    const documentData = {
      id: 'doc_1',
      name: 'Document 1',
      pages: [
        { page_number: 1, url: '/page1.png' },
        { page_number: 2, url: '/page2.png' },
      ],
    };
    const { container, rerender } = renderComponent({ documentData });
    const scrollContainer = container.firstChild;
    scrollContainer.scrollTop = 420;
    mockOnPageChange.mockClear();

    rerender(
      <PreviewViewer
        documentData={{
          ...documentData,
          pages: [...documentData.pages],
        }}
        zoomLevel={1}
        onPageChange={mockOnPageChange}
        viewId={null}
      />
    );

    expect(scrollContainer.scrollTop).toBe(420);
    expect(mockOnPageChange).not.toHaveBeenCalledWith(1);
  });

  it('should reset scroll when the document identity changes', () => {
    const documentData = {
      id: 'doc_1',
      name: 'Document 1',
      pages: [{ page_number: 1, url: '/page1.png' }],
    };
    const { container, rerender } = renderComponent({ documentData });
    const scrollContainer = container.firstChild;
    scrollContainer.scrollTop = 420;
    mockOnPageChange.mockClear();

    rerender(
      <PreviewViewer
        documentData={{
          id: 'doc_2',
          name: 'Document 2',
          pages: [{ page_number: 1, url: '/other-page1.png' }],
        }}
        zoomLevel={1}
        onPageChange={mockOnPageChange}
        viewId={null}
      />
    );

    expect(scrollContainer.scrollTop).toBe(0);
    expect(mockOnPageChange).toHaveBeenCalledWith(1);
  });

  it('should call onPageChange when a new page becomes visible', () => {
    renderComponent();
    triggerIntersection(2);
    expect(mockOnPageChange).toHaveBeenCalledWith(2);
  });

  it('should not track time if viewId is not provided', () => {
    const { unmount } = renderComponent({ viewId: null });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    unmount();
    expect(api.recordPageView).not.toHaveBeenCalled();
  });

  it('should track active time when viewId is provided', () => {
    const { unmount } = renderComponent({ viewId });

    act(() => {
      vi.advanceTimersByTime(5000); // 5 seconds pass
    });

    unmount();

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 1, duration_seconds: 5 },
      false
    );
  });

  it('should pause time tracking after a period of inactivity', () => {
    const { unmount } = renderComponent({ viewId });
    const INACTIVITY_TIMEOUT = 60000;

    // 10 seconds of active time
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Trigger inactivity timeout
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT);
    });

    // 5 more seconds pass, which should not be tracked
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    unmount();

    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ duration_seconds: 60 }),
      false
    );
  });

  it('should resume time tracking on user activity', async () => {
    const { unmount } = renderComponent({ viewId });
    const INACTIVITY_TIMEOUT = 60000;

    // 10 seconds of active time
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Trigger inactivity timeout
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_TIMEOUT);
    });

    // 5 more seconds pass while inactive
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Simulate mouse move to resume activity
    fireEvent.mouseMove(document.body);

    // 5 more seconds of active time pass
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    unmount();

    // Total tracked time should be 60s (before) + 5s (after) = 65s
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ duration_seconds: 65 }),
      false
    );
  });

  it('should send tracking data when the page changes', () => {
    renderComponent({ viewId });

    act(() => {
      vi.advanceTimersByTime(10000); // 10 seconds on page 1
    });

    // Change to page 2
    triggerIntersection(2);

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 1, duration_seconds: 10 },
      false
    );
    expect(mockOnPageChange).toHaveBeenCalledWith(2);

    // After page change, timer should be reset. Let 5s pass on page 2
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Change to page 3
    triggerIntersection(2, false, 0);
    triggerIntersection(3);

    expect(api.recordPageView).toHaveBeenCalledTimes(2);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 2, duration_seconds: 5 },
      false
    );
  });

  it('should send remaining tracking data on unmount', () => {
    const { unmount } = renderComponent({ viewId });

    act(() => {
      vi.advanceTimersByTime(7000); // 7 seconds on page 1
    });

    unmount();

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view_session: viewId, page_number: 1, duration_seconds: 7 },
      false
    );
  });

  it('should render absolute-positioned hyperlink overlays when page_links metadata is present', () => {
    const documentDataWithLinks = {
      pages: [
        {
          page_number: 1,
          url: '/page1.png',
          page_links: {
            links: [
              {
                url: 'https://example.com/overlay-link',
                bbox: { left: 10, top: 20, width: 30, height: 40 },
              },
            ],
          },
        },
      ],
    };

    renderComponent({ documentData: documentDataWithLinks, viewId });

    const linkElement = screen.getByRole('link');
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', 'https://example.com/overlay-link');
    expect(linkElement).toHaveAttribute('target', '_blank');
    expect(linkElement).toHaveAttribute('rel', 'noopener noreferrer');
    expect(linkElement).toHaveStyle({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '40%',
    });

    // Simulate clicking the link
    fireEvent.click(linkElement);
    expect(api.recordLinkClick).toHaveBeenCalledTimes(1);
    expect(api.recordLinkClick).toHaveBeenCalledWith({
      view_session: viewId,
      page_number: 1,
      url: 'https://example.com/overlay-link',
    });
  });

  it('should not render hyperlink overlays when the URL contains unsafe protocols', () => {
    const documentDataWithUnsafeLinks = {
      pages: [
        {
          page_number: 1,
          url: '/page1.png',
          page_links: {
            links: [
              {
                url: 'javascript:alert(1)',
                bbox: { left: 10, top: 20, width: 30, height: 40 },
              },
              {
                url: '   javascript:alert(2)',
                bbox: { left: 12, top: 22, width: 30, height: 40 },
              },
              {
                url: 'java\nscript:alert(3)',
                bbox: { left: 13, top: 23, width: 30, height: 40 },
              },
              {
                url: '\x01javascript:alert(4)',
                bbox: { left: 14, top: 24, width: 30, height: 40 },
              },
              {
                url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4=',
                bbox: { left: 15, top: 25, width: 30, height: 40 },
              },
              {
                url: 'http://example.com/missing-bbox',
                bbox: null,
              },
              {
                url: 'http://example.com/safe',
                bbox: { left: 20, top: 30, width: 30, height: 40 },
              },
            ],
          },
        },
      ],
    };

    renderComponent({ documentData: documentDataWithUnsafeLinks });

    // The safe link should be rendered
    const safeLink = screen.getByRole('link');
    expect(safeLink).toBeInTheDocument();
    expect(safeLink).toHaveAttribute('href', 'http://example.com/safe');

    // The unsafe links (javascript: and data:) should NOT be rendered
    const allLinks = screen.getAllByRole('link');
    expect(allLinks).toHaveLength(1);
  });
});
