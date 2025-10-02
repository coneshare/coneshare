import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      { view: viewId, page_number: 1, duration_seconds: 5 },
      undefined // useBeacon defaults to false
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

    // Only the initial 10 seconds should have been recorded
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ duration_seconds: 10 }),
      undefined
    );
  });

  it('should resume time tracking on user activity', async () => {
    const user = userEvent.setup({ advanceStubs: vi.advanceTimersByTime });
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
    await user.pointer({ target: document.body, keys: '[MouseLeft]' });

    // 5 more seconds of active time pass
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    unmount();

    // Total tracked time should be 10s (before) + 5s (after) = 15s
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({ duration_seconds: 15 }),
      undefined
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
      { view: viewId, page_number: 1, duration_seconds: 10 },
      undefined
    );
    expect(mockOnPageChange).toHaveBeenCalledWith(2);

    // After page change, timer should be reset. Let 5s pass on page 2
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Change to page 3
    triggerIntersection(3);

    expect(api.recordPageView).toHaveBeenCalledTimes(2);
    expect(api.recordPageView).toHaveBeenCalledWith(
      { view: viewId, page_number: 2, duration_seconds: 5 },
      undefined
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
      { view: viewId, page_number: 1, duration_seconds: 7 },
      undefined
    );
  });
});
