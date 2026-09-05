import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ViewSessionsTable } from '../../../components/documents/ViewSessionsTable';

const renderWithRouter = (ui) => {
  return render(ui, { wrapper: MemoryRouter });
};

describe('ViewSessionsTable - Audit Trail & Status Preservation', () => {
  const baseViewSession = {
    id: 'session_1',
    viewer_email: 'analyst@example.com',
    share_link_name: 'Due Diligence Link',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    ip_address: '192.168.1.1',
    country: 'United States',
    city: 'San Francisco',
    duration_seconds: 120,
    completion_rate: 0.85,
    viewed_at: new Date().toISOString(),
    downloaded_at: null,
    is_owner_view: false,
    page_views: [],
    link_clicks: [],
    dataroom_visits: [],
  };

  it('renders active document visits with historical path', () => {
    const views = [
      {
        ...baseViewSession,
        dataroom_visits: [
          {
            id: 'visit_1',
            dataroom_document_id: 'ddoc_1',
            dataroom_document_name: 'Financial_Model_v1.xlsx',
            dataroom_document_type: 'spreadsheet',
            item_type: 'document',
            item_name: 'Financial_Model_v1.xlsx',
            item_path: '/Finance/2026',
            item_status: 'active',
            visited_at: new Date().toISOString(),
            downloaded_at: null,
            page_views: [],
            link_clicks: [],
          },
        ],
      },
    ];

    renderWithRouter(
      <ViewSessionsTable
        views={views}
        totalCount={1}
        loading={false}
        currentPage={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />
    );

    // Expand the session row to see activity log
    const expandButton = screen.getByRole('button', { name: 'Expand row' });
    fireEvent.click(expandButton);

    expect(screen.getByText(/Financial_Model_v1\.xlsx/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity Log/i)).toBeInTheDocument();
  });

  it('renders deleted document visits with preserved historical name and [Deleted] badge', () => {
    const views = [
      {
        ...baseViewSession,
        dataroom_visits: [
          {
            id: 'visit_2',
            dataroom_document_id: null,
            dataroom_document_name: 'Confidential_Memo.pdf',
            dataroom_document_type: 'pdf',
            item_type: 'document',
            item_name: 'Confidential_Memo.pdf',
            item_path: '/Legal',
            item_status: 'deleted',
            visited_at: new Date().toISOString(),
            downloaded_at: null,
            page_views: [],
            link_clicks: [],
          },
        ],
      },
    ];

    renderWithRouter(
      <ViewSessionsTable
        views={views}
        totalCount={1}
        loading={false}
        currentPage={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />
    );

    const expandButton = screen.getByRole('button', { name: 'Expand row' });
    fireEvent.click(expandButton);

    // Historical document name is preserved in the activity log
    expect(screen.getByText(/Confidential_Memo\.pdf/i)).toBeInTheDocument();
    // [Deleted] status badge is displayed
    expect(screen.getByText(/^Deleted$/i)).toBeInTheDocument();
  });

  it('renders renamed document visits with current name, [Renamed] badge, and original snapshot', () => {
    const views = [
      {
        ...baseViewSession,
        dataroom_visits: [
          {
            id: 'visit_3',
            dataroom_document_id: 'ddoc_3',
            dataroom_document_name: 'Final_Agreement_Signed.pdf',
            dataroom_document_type: 'pdf',
            item_type: 'document',
            item_name: 'Draft_Agreement_v1.pdf',
            item_path: '/Contracts',
            item_status: 'renamed',
            visited_at: new Date().toISOString(),
            downloaded_at: null,
            page_views: [],
            link_clicks: [],
          },
        ],
      },
    ];

    renderWithRouter(
      <ViewSessionsTable
        views={views}
        totalCount={1}
        loading={false}
        currentPage={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />
    );

    const expandButton = screen.getByRole('button', { name: 'Expand row' });
    fireEvent.click(expandButton);

    // Live renamed name is shown
    expect(screen.getByText(/Final_Agreement_Signed\.pdf/i)).toBeInTheDocument();
    // [Renamed] badge is shown
    expect(screen.getByText(/^Renamed$/i)).toBeInTheDocument();
  });

  it('renders deleted folder visits with preserved folder name and [Deleted] badge', () => {
    const views = [
      {
        ...baseViewSession,
        dataroom_visits: [
          {
            id: 'visit_4',
            dataroom_folder_id: null,
            dataroom_folder_name: 'Archived_2025',
            item_type: 'folder',
            item_name: 'Archived_2025',
            item_path: '/Archived_2025',
            item_status: 'deleted',
            visited_at: new Date().toISOString(),
            downloaded_at: new Date().toISOString(),
            page_views: [],
            link_clicks: [],
          },
        ],
      },
    ];

    renderWithRouter(
      <ViewSessionsTable
        views={views}
        totalCount={1}
        loading={false}
        currentPage={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />
    );

    const expandButton = screen.getByRole('button', { name: 'Expand row' });
    fireEvent.click(expandButton);

    expect(screen.getByText(/Archived_2025/i)).toBeInTheDocument();
    expect(screen.getByText(/^Deleted$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Downloaded$/i)).toBeInTheDocument();
  });
});
