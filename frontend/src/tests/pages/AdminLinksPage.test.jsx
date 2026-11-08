import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminLinksPage } from '../../pages/AdminLinksPage';
import * as api from '../../services/api';
import { toast } from 'sonner';
import '../../i18n';

vi.mock('../../services/api', () => ({
  getAdminLinks: vi.fn(),
  getAdminLink: vi.fn(),
  updateAdminLink: vi.fn(),
  deleteAdminLink: vi.fn(),
}));

vi.mock('../../contexts/UserProvider', () => ({
  useUser: () => ({
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    refreshUser: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockLinks = [
  {
    id: 'link-1',
    name: 'Investor Pitch',
    slug: 'pitch-deck-2026',
    target_type: 'document',
    target_id: 'doc-1',
    target_name: 'Pitch Deck.pdf',
    document_type: 'pdf',
    created_by: {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
      avatar_url: null,
    },
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-02T10:00:00Z',
    expires_at: null,
    is_active: true,
    is_expired: false,
    status: 'active',
    has_password: true,
    requires_email: true,
    requires_email_verification: false,
    allow_download: true,
    enable_qna: true,
    enable_watermark: true,
    require_nda: false,
    view_count: 14,
    last_viewed_at: '2026-08-03T11:00:00Z',
  },
  {
    id: 'link-2',
    name: 'M&A Dataroom Link',
    slug: 'ma-vault-link',
    target_type: 'dataroom',
    target_id: 'room-1',
    target_name: 'M&A Deal Vault',
    document_type: null,
    created_by: {
      id: 'user-2',
      name: 'Bob',
      email: 'bob@example.com',
      avatar_url: null,
    },
    created_at: '2026-08-05T10:00:00Z',
    updated_at: '2026-08-05T10:00:00Z',
    expires_at: '2026-08-06T10:00:00Z',
    is_active: false,
    is_expired: true,
    status: 'revoked',
    has_password: false,
    requires_email: false,
    requires_email_verification: false,
    allow_download: false,
    enable_qna: false,
    enable_watermark: false,
    require_nda: true,
    view_count: 3,
    last_viewed_at: '2026-08-05T12:00:00Z',
  },
];

const mockMetrics = {
  total_links: 2,
  active_links: 1,
  dataroom_links: 1,
  document_links: 1,
  revoked_links: 1,
  expired_links: 0,
};

describe('AdminLinksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminLinks.mockResolvedValue({
      data: {
        count: 2,
        total_pages: 1,
        current_page: 1,
        results: mockLinks,
        metrics: mockMetrics,
      },
    });
    api.getAdminLink.mockResolvedValue({
      data: {
        ...mockLinks[0],
        recent_view_sessions: [
          {
            id: 'sess-1',
            viewed_at: '2026-08-03T11:00:00Z',
            viewer_email: 'investor@fund.com',
            ip_address: '1.1.1.1',
            country: 'US',
            city: 'New York',
            duration_seconds: 45,
          },
        ],
      },
    });
    api.updateAdminLink.mockResolvedValue({ data: { is_active: false } });
    api.deleteAdminLink.mockResolvedValue({ data: {} });
  });

  it('renders KPI summary cards and table rows with links', async () => {
    render(
      <MemoryRouter>
        <AdminLinksPage />
      </MemoryRouter>
    );

    // Check KPI cards
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // total links
    });
    expect(screen.getByText('Dataroom Links')).toBeInTheDocument();
    expect(screen.getByText('Document Links')).toBeInTheDocument();
    expect(screen.getByText('Investor Pitch')).toBeInTheDocument();
    expect(screen.getByText('M&A Dataroom Link')).toBeInTheDocument();
    expect(screen.getByText('Pitch Deck.pdf')).toBeInTheDocument();
    expect(screen.getByText('M&A Deal Vault')).toBeInTheDocument();
  });

  it('filters by target type and status', async () => {
    render(
      <MemoryRouter>
        <AdminLinksPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.getAdminLinks).toHaveBeenCalled();
    });

    // Select document filter
    const selects = screen.getAllByRole('combobox');
    const typeSelect = selects[0];
    fireEvent.change(typeSelect, { target: { value: 'document' } });

    await waitFor(() => {
      expect(api.getAdminLinks).toHaveBeenCalledWith(
        expect.objectContaining({ target_type: 'document' })
      );
    });

    // Select revoked status filter
    const statusSelect = selects[1];
    fireEvent.change(statusSelect, { target: { value: 'revoked' } });

    await waitFor(() => {
      expect(api.getAdminLinks).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'revoked' })
      );
    });
  });

  it('opens slide-over inspect drawer when clicking a link row', async () => {
    render(
      <MemoryRouter>
        <AdminLinksPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pitch Deck.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pitch Deck.pdf'));

    await waitFor(() => {
      expect(api.getAdminLink).toHaveBeenCalledWith('link-1');
      expect(screen.getByText('investor@fund.com')).toBeInTheDocument();
    });
  });

  it('allows toggling link active status (revoke)', async () => {
    render(
      <MemoryRouter>
        <AdminLinksPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pitch Deck.pdf')).toBeInTheDocument();
    });

    // Inspect drawer
    fireEvent.click(screen.getByText('Pitch Deck.pdf'));

    await waitFor(() => {
      expect(screen.getByText('Revoke Link')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Revoke Link'));

    await waitFor(() => {
      expect(api.updateAdminLink).toHaveBeenCalledWith('link-1', { is_active: false });
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('revoked'));
      expect(screen.getByRole('button', { name: /reactivate link/i })).toBeInTheDocument();
      expect(screen.getAllByText(/revoked/i).length).toBeGreaterThan(0);
    });
  });

  it('allows deleting a link with confirmation modal', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminLinksPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pitch Deck.pdf')).toBeInTheDocument();
    });

    // Open row actions dropdown using userEvent
    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[0]);

    const deleteMenuItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteMenuItem);

    // Confirmation modal should appear
    await waitFor(() => {
      expect(screen.getByText('Delete Share Link')).toBeInTheDocument();
    });

    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(api.deleteAdminLink).toHaveBeenCalledWith('link-1');
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    });
  });

  it('renders pagination with Showing X–Y of Z and navigates to page 2', async () => {
    api.getAdminLinks
      .mockResolvedValueOnce({
        data: {
          count: 171,
          total_pages: 18,
          current_page: 1,
          results: mockLinks,
          metrics: { ...mockMetrics, total_links: 171 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          count: 171,
          total_pages: 18,
          current_page: 2,
          results: [
            {
              ...mockLinks[0],
              id: 'link-3',
              name: 'Page 2 Document Link',
              target_name: 'Page 2 Doc.pdf',
            },
          ],
          metrics: { ...mockMetrics, total_links: 171 },
        },
      });

    render(
      <MemoryRouter>
        <AdminLinksPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Showing 1–10 of 171')).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(api.getAdminLinks).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
      expect(screen.getByText('Page 2 Doc.pdf')).toBeInTheDocument();
    });
  });
});
