import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import '../../../i18n';
import { SpreadsheetViewer } from '../../../components/documents/SpreadsheetViewer';

vi.mock('axios');

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

  it('prevents clipboard copy when allowDownload is false or watermarking is enabled', async () => {
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

    // Top-level container should have select-none class
    expect(container.firstChild).toHaveClass('select-none');

    // Trigger copy event
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    container.firstChild.dispatchEvent(copyEvent);
    expect(copyEvent.defaultPrevented).toBe(true);
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
});
