import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import '../../../i18n';
import { SpreadsheetViewer } from '../../../components/documents/SpreadsheetViewer';
import * as api from '../../../services/api';

vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: vi.fn(),
    post: vi.fn(),
  };
  return {
    default: {
      ...mockInstance,
      create: vi.fn(() => mockInstance),
    },
    ...mockInstance,
    create: vi.fn(() => mockInstance),
  };
});
vi.mock('../../../services/api');

describe('SpreadsheetViewer', () => {
  const mockSpreadsheetData = {
    sheets: [
      {
        id: 0,
        name: 'Financials',
        row_count: 2,
        col_count: 2,
        columns: [
          { name: 'A', width: 100 },
          { name: 'B', width: 120 },
        ],
        cells: {
          '0:0': { v: 'Item', s: { b: true } },
          '0:1': { v: 'Amount', s: { b: true } },
          '1:0': { v: 'Revenue', s: {} },
          '1:1': { v: '$1,000,000', s: {} },
        },
        merges: [],
        is_truncated: false,
      },
      {
        id: 1,
        name: 'Headcount',
        row_count: 1,
        col_count: 2,
        columns: [
          { name: 'A', width: 100 },
          { name: 'B', width: 100 },
        ],
        cells: {
          '0:0': { v: 'Department', s: {} },
          '0:1': { v: 'Count', s: {} },
        },
        merges: [],
        is_truncated: false,
      },
    ],
  };

  const spreadsheetUrl = 'https://storage.example.com/test_spreadsheet.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while fetching spreadsheet JSON', () => {
    axios.get.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    expect(screen.getByText(/Loading spreadsheet/i)).toBeInTheDocument();
  });

  it('renders error state when API request fails', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('exposes goToPage via ref and switches active sheet', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });
    const ref = React.createRef();

    render(<SpreadsheetViewer ref={ref} spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText('Financials')).toBeInTheDocument();
    });

    expect(typeof ref.current.goToPage).toBe('function');

    act(() => {
      ref.current.goToPage(2); // Go to Sheet 2 ("Headcount")
    });

    await waitFor(() => {
      expect(screen.getByText('Headcount').closest('button')).toHaveClass('bg-background');
    });
  });

  it('calls onPageChange and onDocumentLoad when navigating sheets', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });
    const onPageChange = vi.fn();
    const onDocumentLoad = vi.fn();
    const ref = React.createRef();

    render(
      <SpreadsheetViewer
        ref={ref}
        spreadsheetUrl={spreadsheetUrl}
        title="Quarterly Report"
        onPageChange={onPageChange}
        onDocumentLoad={onDocumentLoad}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Financials')).toBeInTheDocument();
    });

    expect(onDocumentLoad).toHaveBeenCalledWith({ numPages: mockSpreadsheetData.sheets.length });

    act(() => {
      ref.current.goToPage(2);
    });

    expect(onPageChange).toHaveBeenCalledWith(2);

    const sheet1Btn = screen.getByText('Financials').closest('button');
    fireEvent.click(sheet1Btn);

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('renders sheets, headers, and cells on successful load', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText('Financials')).toBeInTheDocument();
      expect(screen.getByText('Headcount')).toBeInTheDocument();
    });

    // Verify column headers
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();

    // Verify cell values
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$1,000,000')).toBeInTheDocument();

    // Default active cell indicator is A1
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('updates active cell coordinate on cell click', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    // Click on Amount cell (which is B1)
    fireEvent.click(screen.getByText('Amount'));

    expect(screen.getByText('B1')).toBeInTheDocument();
  });

  it('switches sheets when clicking sheet tabs', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText('Financials')).toBeInTheDocument();
    });

    // Initially on Sheet 1 (Financials)
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.queryByText('Department')).not.toBeInTheDocument();

    // Switch to Sheet 2 (Headcount)
    fireEvent.click(screen.getByText('Headcount'));

    await waitFor(() => {
      expect(screen.getByText('Department')).toBeInTheDocument();
      expect(screen.getByText('Count')).toBeInTheDocument();
      expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });
  });

  it('renders watermark overlay outside the scroll container so it stays fixed upon scrolling', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    const { container, rerender } = render(
      <SpreadsheetViewer
        spreadsheetUrl={spreadsheetUrl}
        title="Quarterly Report"
        watermarkText="CONFIDENTIAL - USER@EXAMPLE.COM"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('spreadsheet-watermark')).toBeInTheDocument();
    });

    const watermark = screen.getByTestId('spreadsheet-watermark');
    const scrollContainer = container.querySelector('.overflow-auto');
    expect(scrollContainer).toBeInTheDocument();

    // Watermark must NOT be inside the overflow-auto scroll container, otherwise it scrolls away
    expect(scrollContainer.contains(watermark)).toBe(false);

    // Rerender without watermark
    rerender(
      <SpreadsheetViewer
        spreadsheetUrl={spreadsheetUrl}
        title="Quarterly Report"
        watermarkText=""
      />
    );

    expect(screen.queryByTestId('spreadsheet-watermark')).not.toBeInTheDocument();
  });

  it('prevents clipboard copy and context menu when allowDownload is false or watermarking is enabled', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    const { container } = render(
      <SpreadsheetViewer
        spreadsheetUrl={spreadsheetUrl}
        title="Quarterly Report"
        watermarkText="CONFIDENTIAL"
        allowDownload={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Financials')).toBeInTheDocument();
    });

    // Top-level container should have select-none class and not select-text
    expect(container.firstChild).toHaveClass('select-none');
    expect(container.firstChild).not.toHaveClass('select-text');

    // Trigger copy event
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    container.firstChild.dispatchEvent(copyEvent);
    expect(copyEvent.defaultPrevented).toBe(true);

    // Trigger contextmenu event
    const contextMenuEvent = new Event('contextmenu', { bubbles: true, cancelable: true });
    container.firstChild.dispatchEvent(contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);
  });

  it('honors explicit canCopy prop over default watermark and download flags', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    // 1. canCopy={false} enforces protection even when allowDownload is true and no watermark
    const { container, rerender } = render(
      <SpreadsheetViewer
        spreadsheetUrl={spreadsheetUrl}
        title="Quarterly Report"
        watermarkText=""
        allowDownload={true}
        canCopy={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Financials')).toBeInTheDocument();
    });

    expect(container.firstChild).toHaveClass('select-none');
    const blockedCopy = new Event('copy', { bubbles: true, cancelable: true });
    container.firstChild.dispatchEvent(blockedCopy);
    expect(blockedCopy.defaultPrevented).toBe(true);

    // 2. canCopy={true} permits copying even when watermarkText is present
    rerender(
      <SpreadsheetViewer
        spreadsheetUrl={spreadsheetUrl}
        title="Quarterly Report"
        watermarkText="CONFIDENTIAL"
        allowDownload={false}
        canCopy={true}
      />
    );

    expect(container.firstChild).toHaveClass('select-text');
    expect(container.firstChild).not.toHaveClass('select-none');
    const allowedCopy = new Event('copy', { bubbles: true, cancelable: true });
    container.firstChild.dispatchEvent(allowedCopy);
    expect(allowedCopy.defaultPrevented).toBe(false);

    const allowedContextMenu = new Event('contextmenu', { bubbles: true, cancelable: true });
    container.firstChild.dispatchEvent(allowedContextMenu);
    expect(allowedContextMenu.defaultPrevented).toBe(false);
  });

  it('renders truncation notice when sheet is marked as truncated', async () => {
    const truncatedData = {
      sheets: [
        {
          id: 0,
          name: 'BigData',
          row_count: 2000,
          col_count: 1,
          columns: [{ name: 'A', width: 100 }],
          cells: { '0:0': { v: 'Row 1' } },
          is_truncated: true,
        },
      ],
    };
    axios.get.mockResolvedValue({ data: truncatedData });

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Big Data" />);

    await waitFor(() => {
      expect(screen.getByText(/Showing first 2,000 rows/i)).toBeInTheDocument();
    });
  });

  it('renders column headers in a unified sticky header row alongside the corner cell without overlapping row cells', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('Item')).toBeInTheDocument();
    });

    const colHeaderA = screen.getByText('A');
    const cellItem = screen.getByText('Item');
    const rowHeader1 = screen.getByText('1');

    // 1. Column headers and corner cell must share a horizontal header row container (display: flex)
    // so column headers are positioned alongside the corner cell at Y=0, not pushed below it into row 1.
    const headerRow = colHeaderA.closest('[data-testid="spreadsheet-header-row"]');
    expect(headerRow).toBeInTheDocument();
    expect(headerRow).toHaveClass('flex');

    // 2. The corner cell must be inside the header row
    const cornerCell = headerRow.querySelector('[data-testid="spreadsheet-corner-cell"]');
    expect(cornerCell).toBeInTheDocument();

    // 3. Grid body containing row headers and cell matrix must be in a separate container below the header row
    const gridBody = cellItem.closest('[data-testid="spreadsheet-grid-body"]');
    expect(gridBody).toBeInTheDocument();
    expect(gridBody).toContainElement(rowHeader1);
    expect(gridBody).toContainElement(cellItem);
  });

  it('displays search occurrences in real time and supports navigation between matches', async () => {
    axios.get.mockResolvedValue({ data: mockSpreadsheetData });

    render(<SpreadsheetViewer spreadsheetUrl={spreadsheetUrl} title="Quarterly Report" />);

    await waitFor(() => {
      expect(screen.getByText('Item')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search/i);

    // 1. Search for 'e' which matches 'Item' and 'Revenue' (2 occurrences)
    fireEvent.change(searchInput, { target: { value: 'e' } });

    const searchCount = await screen.findByTestId('search-count');
    expect(searchCount).toHaveTextContent('1/2');

    // 2. Click next match button
    const nextBtn = screen.getByRole('button', { name: /Next match/i });
    fireEvent.click(nextBtn);
    expect(screen.getByTestId('search-count')).toHaveTextContent('2/2');

    // 3. Click next match button again (should wrap back to 1)
    fireEvent.click(nextBtn);
    expect(screen.getByTestId('search-count')).toHaveTextContent('1/2');

    // 4. Click previous match button (wraps to 2)
    const prevBtn = screen.getByRole('button', { name: /Previous match/i });
    fireEvent.click(prevBtn);
    expect(screen.getByTestId('search-count')).toHaveTextContent('2/2');

    // 5. Search for non-existent keyword -> shows 0/0
    fireEvent.change(searchInput, { target: { value: 'nonexistent_keyword' } });
    expect(screen.getByTestId('search-count')).toHaveTextContent('0/0');

    // 6. Click clear button -> resets search
    const clearBtn = screen.getByRole('button', { name: /Clear search/i });
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue('');
    expect(screen.queryByTestId('search-count')).not.toBeInTheDocument();
  });

  describe('Telemetry & Audit Tracking (T4-05)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('records duration and sheet page_number via recordPageView on sheet tab switch and unmount', async () => {
      axios.get.mockResolvedValue({ data: mockSpreadsheetData });

      const { unmount } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
          dataroomVisitId="visit_abc"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Financials')).toBeInTheDocument();

      // Advance time by 5 seconds on Sheet 1 (Financials -> page_number: 1)
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Switch to Sheet 2 (Headcount -> page_number: 2)
      act(() => {
        fireEvent.click(screen.getByText('Headcount'));
      });

      // Switching sheet tabs should flush duration for sheet 1
      expect(api.recordPageView).toHaveBeenCalledTimes(1);
      expect(api.recordPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          view_session: 'session_xyz',
          dataroom_visit: 'visit_abc',
          page_number: 1,
          duration_seconds: 5,
          media_type: 'spreadsheet',
        }),
        false
      );

      // Advance time by 7 seconds on Sheet 2
      act(() => {
        vi.advanceTimersByTime(7000);
      });

      // Unmounting should flush duration for sheet 2
      unmount();

      expect(api.recordPageView).toHaveBeenCalledTimes(2);
      expect(api.recordPageView).toHaveBeenLastCalledWith(
        expect.objectContaining({
          view_session: 'session_xyz',
          dataroom_visit: 'visit_abc',
          page_number: 2,
          duration_seconds: 7,
          media_type: 'spreadsheet',
        }),
        false
      );
    });

    it('flushes periodic heartbeat every 30 seconds of active viewing', async () => {
      axios.get.mockResolvedValue({ data: mockSpreadsheetData });

      render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Financials')).toBeInTheDocument();

      // Advance by 30 seconds
      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(api.recordPageView).toHaveBeenCalledTimes(1);
      expect(api.recordPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          view_session: 'session_xyz',
          page_number: 1,
          duration_seconds: 30,
          media_type: 'spreadsheet',
        }),
        false
      );
    });

    it('does not dispatch recordPageView when viewId is omitted', async () => {
      axios.get.mockResolvedValue({ data: mockSpreadsheetData });

      const { unmount } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
        fireEvent.click(screen.getByText('Headcount'));
      });

      unmount();

      expect(api.recordPageView).not.toHaveBeenCalled();
    });

    it('does not flush orphaned page view when dataroomVisitId transitions from null to resolved ID', async () => {
      axios.get.mockResolvedValue({ data: mockSpreadsheetData });

      const { rerender, unmount } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
          dataroomVisitId={null}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Financials')).toBeInTheDocument();

      // 2 seconds elapse before visit ID resolves
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Update prop to resolved visit ID
      rerender(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
          dataroomVisitId="visit_resolved_123"
        />
      );

      // Must NOT prematurely dispatch an orphaned PageView without dataroom_visit
      expect(api.recordPageView).not.toHaveBeenCalled();

      // Advance by another 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      unmount();

      // Exactly 1 call with cumulative duration 5 seconds and resolved dataroom_visit
      expect(api.recordPageView).toHaveBeenCalledTimes(1);
      expect(api.recordPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          view_session: 'session_xyz',
          dataroom_visit: 'visit_resolved_123',
          page_number: 1,
          duration_seconds: 5,
          media_type: 'spreadsheet',
        }),
        false
      );
    });

    it('does not accumulate duration or record page view during loading or error states', async () => {
      // 1. Unresolved loading state
      axios.get.mockReturnValue(new Promise(() => {}));

      const { unmount: unmountLoading } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
        />
      );

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      unmountLoading();
      expect(api.recordPageView).not.toHaveBeenCalled();

      // 2. Failed fetch error state
      axios.get.mockRejectedValue(new Error('Fetch failed'));

      const { unmount: unmountError } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      unmountError();
      expect(api.recordPageView).not.toHaveBeenCalled();
    });

    it('resets inactivity timer on grid container scroll event', async () => {
      axios.get.mockResolvedValue({ data: mockSpreadsheetData });

      const { unmount } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Financials')).toBeInTheDocument();

      // Advance by 50 seconds
      act(() => {
        vi.advanceTimersByTime(50000);
      });

      // Scroll inside the grid container
      const scrollContainer = screen.getByTestId('spreadsheet-scroll-container');
      act(() => {
        fireEvent.scroll(scrollContainer);
      });

      // Advance by another 20 seconds (70 seconds total, but user active at t=50s)
      act(() => {
        vi.advanceTimersByTime(20000);
      });

      unmount();

      // Periodic flushes occurred at 30s, 60s, and remaining 10s upon unmount (70s total active viewing)
      expect(api.recordPageView).toHaveBeenCalledTimes(3);
      expect(api.recordPageView).toHaveBeenLastCalledWith(
        expect.objectContaining({
          view_session: 'session_xyz',
          page_number: 1,
          duration_seconds: 10,
          media_type: 'spreadsheet',
        }),
        false
      );
    });

    it('does not send telemetry when workbook has empty sheets array', async () => {
      axios.get.mockResolvedValue({ data: { sheets: [] } });

      const { unmount } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Empty Report"
          viewId="session_xyz"
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Advance by 35 seconds
      act(() => {
        vi.advanceTimersByTime(35000);
      });

      unmount();
      expect(api.recordPageView).not.toHaveBeenCalled();
    });

    it('does not reset accumulated active viewing time when documentData prop updates', async () => {
      axios.get.mockResolvedValue({ data: mockSpreadsheetData });

      const { rerender, unmount } = render(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
          documentData={{ spreadsheet_preview_url: spreadsheetUrl, id: 'doc-1' }}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('Financials')).toBeInTheDocument();

      // Accumulate 15 seconds
      act(() => {
        vi.advanceTimersByTime(15000);
      });

      // Parent updates documentData (e.g. background sync or re-render)
      rerender(
        <SpreadsheetViewer
          spreadsheetUrl={spreadsheetUrl}
          title="Quarterly Report"
          viewId="session_xyz"
          documentData={{ spreadsheet_preview_url: spreadsheetUrl, id: 'doc-1', updated_at: 'now' }}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Accumulate another 15 seconds (total 30 seconds triggers periodic flush)
      act(() => {
        vi.advanceTimersByTime(15000);
      });

      expect(api.recordPageView).toHaveBeenCalledTimes(1);
      expect(api.recordPageView).toHaveBeenCalledWith(
        expect.objectContaining({
          view_session: 'session_xyz',
          page_number: 1,
          duration_seconds: 30,
          media_type: 'spreadsheet',
        }),
        false
      );

      unmount();
    });
  });

  describe('Fit-to-View / Fit-to-Width (Issue #484)', () => {
    const wideSpreadsheetData = {
      sheets: [
        {
          id: 0,
          name: 'WideSheet',
          row_count: 5,
          col_count: 15,
          columns: Array.from({ length: 15 }, (_, i) => ({
            name: String.fromCharCode(65 + i),
            width: 100,
          })),
          cells: {
            '0:0': { v: 'Header A' },
            '0:14': { v: 'Header O' },
          },
          merges: [],
          is_truncated: false,
        },
      ],
    };

    it('exposes fitToWidth and getFitScale on imperative ref and calculates responsive fit scale', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-wide/spreadsheet-preview/';
      axios.get.mockResolvedValueOnce({ data: wideSpreadsheetData });

      const viewerRef = React.createRef();
      const onZoomChange = vi.fn();

      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Wide Spreadsheet"
          zoomLevel={1}
          onZoomChange={onZoomChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('WideSheet')).toBeInTheDocument();

      // Ensure ref exposes fit methods
      expect(viewerRef.current).toBeDefined();
      expect(typeof viewerRef.current.fitToWidth).toBe('function');
      expect(typeof viewerRef.current.getFitScale).toBe('function');

      // Unscaled grid width = 54 (row header) + 15 * 100 = 1554px.
      // Default test viewportWidth = 800px.
      // Expected fit scale is ~ (800 - 8) / 1554 ≈ 0.51, which should be below the legacy 0.75 clamp.
      const calculatedScale = viewerRef.current.getFitScale();
      expect(calculatedScale).toBeLessThan(0.75);
      expect(calculatedScale).toBeGreaterThanOrEqual(0.35);

      // Trigger fitToWidth
      act(() => {
        viewerRef.current.fitToWidth();
      });

      expect(onZoomChange).toHaveBeenCalledWith(calculatedScale);

      // Second call to fitToWidth should toggle back to actual size (1.0)
      act(() => {
        viewerRef.current.fitToWidth();
      });
      expect(onZoomChange).toHaveBeenCalledWith(1);
    });

    it('exits fit mode when zoomLevel is adjusted manually by the parent', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-manual/spreadsheet-preview/';
      axios.get.mockResolvedValueOnce({ data: wideSpreadsheetData });

      const viewerRef = React.createRef();
      const onZoomChange = vi.fn();

      const { rerender } = render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Wide Spreadsheet"
          zoomLevel={1}
          onZoomChange={onZoomChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Enter fit mode
      act(() => {
        viewerRef.current.fitToWidth(true);
      });
      expect(viewerRef.current.isFitMode()).toBe(true);

      // Parent simulates user clicking zoom in (+) toolbar button
      rerender(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Wide Spreadsheet"
          zoomLevel={1.1}
          onZoomChange={onZoomChange}
        />
      );

      expect(viewerRef.current.isFitMode()).toBe(false);
    });

    it('preserves scale at 1.0 for small sheets that already fit within viewport', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-small/spreadsheet-preview/';
      const smallData = {
        sheets: [
          {
            id: 0,
            name: 'SmallSheet',
            row_count: 3,
            col_count: 3,
            columns: [
              { name: 'A', width: 80 },
              { name: 'B', width: 80 },
              { name: 'C', width: 80 },
            ],
            cells: { '0:0': { v: '1' } },
            merges: [],
            is_truncated: false,
          },
        ],
      };
      axios.get.mockResolvedValueOnce({ data: smallData });

      const viewerRef = React.createRef();
      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Small Sheet"
          zoomLevel={1}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('SmallSheet')).toBeInTheDocument();
      // Total unscaled width = 54 + 240 = 294px < 800px. Unscaled height = 28 + 84 = 112px < 600px.
      // Fits at 1.0 without stretching or blowing up.
      expect(viewerRef.current.getFitScale()).toBe(1.0);
    });

    it('prioritizes width-constrained scaling for tall sheets to avoid unreadable compression', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-tall/spreadsheet-preview/';
      const tallData = {
        sheets: [
          {
            id: 0,
            name: 'TallSheet',
            row_count: 500, // 500 rows * 28px = 14,000px height
            col_count: 4,
            columns: [
              { name: 'A', width: 100 },
              { name: 'B', width: 100 },
              { name: 'C', width: 100 },
              { name: 'D', width: 100 },
            ],
            cells: { '0:0': { v: 'Top' } },
            merges: [],
            is_truncated: false,
          },
        ],
      };
      axios.get.mockResolvedValueOnce({ data: tallData });

      const viewerRef = React.createRef();
      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Tall Sheet"
          zoomLevel={1}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('TallSheet')).toBeInTheDocument();
      // Unscaled width = 54 + 400 = 454px <= 800px.
      // Unscaled height is 14,028px. Height scale would be ~0.04, which is < 0.6.
      // Should prioritize width fit (1.0) so text remains readable and scrolls vertically.
      expect(viewerRef.current.getFitScale()).toBe(1.0);
    });

    it('measures viewport dimensions and attaches ResizeObserver once data loads', async () => {
      let observeTarget = null;
      const observeSpy = vi.fn((node) => {
        observeTarget = node;
      });
      const originalRO = globalThis.ResizeObserver;
      globalThis.ResizeObserver = vi.fn(function () {
        return {
          observe: observeSpy,
          unobserve: vi.fn(),
          disconnect: vi.fn(),
        };
      });

      try {
        const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-ro/spreadsheet-preview/';
        axios.get.mockResolvedValueOnce({ data: wideSpreadsheetData });

        render(
          <SpreadsheetViewer
            spreadsheetUrl={spreadsheetUrl}
            title="RO Test"
            zoomLevel={1}
          />
        );

        await act(async () => {
          await Promise.resolve();
        });

        const container = screen.getByTestId('spreadsheet-scroll-container');
        expect(observeSpy).toHaveBeenCalled();
        expect(observeTarget).toBe(container);
      } finally {
        globalThis.ResizeObserver = originalRO;
      }
    });

    it('computes fit scale against used cell range rather than trailing empty columns', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-used-range/spreadsheet-preview/';
      const sheetWithTrailingEmptyCols = {
        sheets: [
          {
            id: 0,
            name: 'SparseSheet',
            row_count: 5,
            col_count: 20,
            columns: Array.from({ length: 20 }, (_, i) => ({
              name: String.fromCharCode(65 + i),
              width: 100,
            })),
            cells: {
              '0:0': { v: 'A1' },
              '1:2': { v: 'C2' },
            },
            merges: [],
            is_truncated: false,
          },
        ],
      };
      axios.get.mockResolvedValueOnce({ data: sheetWithTrailingEmptyCols });

      const viewerRef = React.createRef();
      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Sparse Sheet"
          zoomLevel={1}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Used range is columns A..C (3 columns = 300px + 54 = 354px).
      // Viewport width = 800px.
      // Since 354px <= 800px, it fits at 1.0.
      expect(viewerRef.current.getFitScale()).toBe(1.0);
    });

    it('uses Math.floor to ensure fitScale does not cause pixel overflow', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-floor/spreadsheet-preview/';
      axios.get.mockResolvedValueOnce({ data: wideSpreadsheetData });

      const viewerRef = React.createRef();
      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Floor Test"
          zoomLevel={1}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // 792 / 1554 = 0.50965... Math.floor gives 0.50, whereas Math.round gave 0.51
      const scale = viewerRef.current.getFitScale();
      expect(scale).toBe(0.5);
    });

    it('does not invoke onZoomChange duplicate times when entering fit mode', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-no-dup/spreadsheet-preview/';
      axios.get.mockResolvedValueOnce({ data: wideSpreadsheetData });

      const viewerRef = React.createRef();
      const onZoomChange = vi.fn();

      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="No Duplicate"
          zoomLevel={1}
          onZoomChange={onZoomChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      onZoomChange.mockClear();

      act(() => {
        viewerRef.current.fitToWidth(true);
      });

      // Should be called exactly once for the fit transition, not duplicated by the effect
      expect(onZoomChange).toHaveBeenCalledTimes(1);
    });

    it('maintains a readable minimum row height of at least 18px even at 0.35 scale', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-min-h/spreadsheet-preview/';
      axios.get.mockResolvedValueOnce({ data: wideSpreadsheetData });

      const viewerRef = React.createRef();
      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Min Height"
          zoomLevel={0.35}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      const headerRow = screen.getByTestId('spreadsheet-header-row');
      // At scale 0.35, 28 * 0.35 = 9.8px, but min height must be at least 18px to prevent text clipping
      expect(parseInt(headerRow.style.height, 10)).toBeGreaterThanOrEqual(18);
    });

    it('recomputes fit scale when switching sheets while in fit mode', async () => {
      const spreadsheetUrl = 'https://example.com/api/v1/documents/doc-multi-fit/spreadsheet-preview/';
      const multiSheetData = {
        sheets: [
          {
            id: 0,
            name: 'SmallSheet',
            row_count: 2,
            col_count: 2,
            columns: [{ name: 'A', width: 80 }, { name: 'B', width: 80 }],
            cells: { '0:0': { v: 'S1' } },
            merges: [],
            is_truncated: false,
          },
          {
            id: 1,
            name: 'WideSheet',
            row_count: 5,
            col_count: 15,
            columns: Array.from({ length: 15 }, (_, i) => ({
              name: String.fromCharCode(65 + i),
              width: 100,
            })),
            cells: { '0:0': { v: 'W1' }, '0:14': { v: 'W15' } },
            merges: [],
            is_truncated: false,
          },
        ],
      };
      axios.get.mockResolvedValueOnce({ data: multiSheetData });

      const viewerRef = React.createRef();
      const onZoomChange = vi.fn();

      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Multi Sheet Fit"
          zoomLevel={1}
          onZoomChange={onZoomChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Engage fit mode on SmallSheet (fits at 1.0)
      act(() => {
        viewerRef.current.fitToWidth(true);
      });
      expect(viewerRef.current.isFitMode()).toBe(true);

      onZoomChange.mockClear();

      // Switch to WideSheet
      const wideTab = screen.getByText('WideSheet');
      act(() => {
        fireEvent.click(wideTab);
      });

      // Should automatically re-evaluate fit scale for WideSheet (~0.50)
      expect(onZoomChange).toHaveBeenCalledWith(0.5);
    });

    it('reports false to onFitModeChange when unmounting', async () => {
      const onFitModeChange = vi.fn();
      const viewerRef = React.createRef();
      const { unmount } = render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Unmount Test"
          zoomLevel={1}
          onFitModeChange={onFitModeChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Enter fit mode
      act(() => {
        viewerRef.current.fitToWidth(true);
      });
      expect(onFitModeChange).toHaveBeenCalledWith(true);

      onFitModeChange.mockClear();

      // Unmount viewer
      unmount();
      expect(onFitModeChange).toHaveBeenCalledWith(false);
    });

    it('adjusts fit scale downward to prevent horizontal overflow from row header minimum and rounding', async () => {
      // 15 columns of width 100 = 1500px unscaled cols width
      // Plus ROW_HEADER_WIDTH 54 = 1554px unscaled total
      const columns = Array.from({ length: 15 }, (_, i) => ({ name: String.fromCharCode(65 + i), width: 100 }));
      const cells = {};
      columns.forEach((_, i) => {
        cells[`0:${i}`] = { v: `Val${i}` };
      });
      const overflowData = {
        sheets: [
          {
            id: 0,
            name: 'ExactFitSheet',
            row_count: 10,
            col_count: 15,
            columns,
            cells,
            merges: [],
            is_truncated: false,
          },
        ],
      };
      axios.get.mockResolvedValueOnce({ data: overflowData });

      const viewerRef = React.createRef();
      render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl={spreadsheetUrl}
          title="Overflow Test"
          zoomLevel={1}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Compute scale for viewport width 785 (availWidth = 777)
      // Unscaled grid width = 54 + 1500 = 1554
      // Continuous scale: 777 / 1554 = 0.50
      // At scale 0.50: rowHeaderWidth is Math.max(38, Math.round(54 * 0.50)) = 38
      // rendered columns: 15 * 50 = 750
      // rendered total: 38 + 750 = 788 > 777 (would overflow by 11px!)
      // Adjuster steps down to 0.49: 38 + 15 * 49 = 773 <= 777.
      const scale = viewerRef.current.getFitScale(undefined, 785, 600);
      expect(scale).toBe(0.49);
    });

    it('recalculates fit scale when spreadsheetUrl changes to a replacement workbook while in fit mode', async () => {
      const wideData = {
        sheets: [
          {
            id: 0,
            name: 'WideDoc',
            row_count: 10,
            col_count: 20,
            columns: Array.from({ length: 20 }, (_, i) => ({ name: `Col${i}`, width: 100 })),
            cells: { '0:19': { v: 'End' } },
            merges: [],
            is_truncated: false,
          },
        ],
      };
      const smallData = {
        sheets: [
          {
            id: 0,
            name: 'SmallDoc',
            row_count: 5,
            col_count: 3,
            columns: [
              { name: 'A', width: 100 },
              { name: 'B', width: 100 },
              { name: 'C', width: 100 },
            ],
            cells: { '0:2': { v: 'Small' } },
            merges: [],
            is_truncated: false,
          },
        ],
      };

      axios.get.mockResolvedValueOnce({ data: wideData });

      const onZoomChange = vi.fn();
      const viewerRef = React.createRef();
      const { rerender } = render(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl="https://example.com/docA.json"
          title="Doc A"
          zoomLevel={1}
          onZoomChange={onZoomChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Turn on fit mode on Doc A (fits at ~0.38)
      act(() => {
        viewerRef.current.fitToWidth(true);
      });
      expect(viewerRef.current.isFitMode()).toBe(true);

      onZoomChange.mockClear();
      axios.get.mockResolvedValueOnce({ data: smallData });

      // Rerender with replacement doc B URL while staying in fit mode
      rerender(
        <SpreadsheetViewer
          ref={viewerRef}
          spreadsheetUrl="https://example.com/docB.json"
          title="Doc B"
          zoomLevel={1}
          onZoomChange={onZoomChange}
        />
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Should automatically recalculate and apply scale 1.0 for SmallDoc
      expect(onZoomChange).toHaveBeenCalledWith(1.0);
    });
  });
});
