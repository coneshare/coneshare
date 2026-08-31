import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminDataroomsPage } from '../../pages/AdminDataroomsPage';
import * as api from '../../services/api';
import { toast } from 'sonner';
import '../../i18n';

vi.mock('../../services/api', () => ({
  getAdminDatarooms: vi.fn(),
  updateAdminDataroom: vi.fn(),
  deleteAdminDataroom: vi.fn(),
  upgradeAdminDataroomStorage: vi.fn(),
  transferAdminDataroomOwnership: vi.fn(),
  getAdminEligibleCollaborators: vi.fn(),
  getAdminDataroomCollaborators: vi.fn(),
}));

vi.mock('../../contexts/UserProvider', () => ({
  useUser: () => ({
    user: { id: 'admin-1', email: 'admin@example.com', role: 'admin' },
    refreshUser: vi.fn(),
  }),
}));

vi.mock('../../components/ui/Pagination', () => ({
  Pagination: ({ currentPage, totalPages, onPageChange }) =>
    totalPages > 1 ? (
      <div>
        <span>Page {currentPage} of {totalPages}</span>
        <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
      </div>
    ) : null,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockDatarooms = [
  {
    id: 'droom-1',
    name: 'Series A Due Diligence',
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-10T12:00:00Z',
    storage_version: 2,
    storage_quota_mb: 1000,
    storage_used_bytes: 850 * 1024 * 1024, // 85% full (near capacity)
    collaborator_count: 2,
    active_links_count: 3,
    last_viewed_at: '2026-08-10T12:00:00Z',
    owner: {
      id: 'usr-1',
      name: 'Alice Smith',
      email: 'alice@example.com',
      avatar_url: null,
    },
    collaborators: [
      { user: { id: 'usr-2', name: 'Bob Johnson', email: 'bob@example.com' } },
      { user: { id: 'usr-3', name: 'Carol Danvers', email: 'carol@example.com' } },
    ],
  },
  {
    id: 'droom-2',
    name: 'Legacy Deal Vault',
    created_at: '2026-07-15T08:00:00Z',
    updated_at: '2026-07-20T09:00:00Z',
    storage_version: 1, // Legacy v1
    storage_quota_mb: 0, // Unlimited
    storage_used_bytes: 120 * 1024 * 1024,
    collaborator_count: 0,
    active_links_count: 1,
    last_viewed_at: null,
    owner: {
      id: 'usr-2',
      name: 'Bob Johnson',
      email: 'bob@example.com',
      avatar_url: null,
    },
    collaborators: [],
  },
];

const mockPaginatedResponse = {
  count: mockDatarooms.length,
  total_pages: 1,
  current_page: 1,
  page_size: 10,
  metrics: {
    total_rooms: mockDatarooms.length,
    total_storage_bytes: 970 * 1024 * 1024,
    total_active_links: 4,
  },
  results: mockDatarooms,
};

describe('AdminDataroomsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getAdminDatarooms.mockImplementation((params = {}) => {
      let filtered = [...mockDatarooms];
      if (params.search) {
        filtered = filtered.filter((d) => d.name.toLowerCase().includes(params.search.toLowerCase()));
      }
      if (params.status === 'near_capacity') {
        filtered = filtered.filter((d) => d.storage_quota_mb > 0 && d.storage_used_bytes / (d.storage_quota_mb * 1024 * 1024) >= 0.8);
      } else if (params.status === 'legacy_v1') {
        filtered = filtered.filter((d) => d.storage_version < 2);
      }
      if (params.ordering === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      } else if (params.ordering === '-name') {
        filtered.sort((a, b) => b.name.localeCompare(a.name));
      }
      return Promise.resolve({
        data: {
          ...mockPaginatedResponse,
          count: filtered.length,
          results: filtered,
        },
      });
    });
    api.getAdminEligibleCollaborators.mockResolvedValue({
      data: [{ id: 'usr-3', name: 'Carol Danvers', email: 'carol@example.com' }],
    });
  });

  it('renders overview KPI cards and datarooms table', async () => {
    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
      expect(screen.getByText('Legacy Deal Vault')).toBeInTheDocument();
    });

    // Check KPI Cards
    expect(screen.getByText('Total Datarooms')).toBeInTheDocument();
    expect(screen.getByText('Total Storage Consumed')).toBeInTheDocument();
    expect(screen.getAllByText('Active Links').length).toBeGreaterThan(0);

    // Check storage badges: only legacy v1 shows a badge
    expect(screen.queryByText('Org-Scoped')).not.toBeInTheDocument();
    expect(screen.getByText('User-Scoped')).toBeInTheDocument();

    // Check table headers
    expect(screen.getByRole('button', { name: /Owner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active Links/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Last Viewed/i })).toBeInTheDocument();

    // Check owner info
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
  });

  it('filters datarooms by search query', async () => {
    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search rooms or owners/i);
    fireEvent.change(searchInput, { target: { value: 'Series A' } });

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
      expect(screen.queryByText('Legacy Deal Vault')).not.toBeInTheDocument();
    });
  });

  it('filters datarooms by status dropdown', async () => {
    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('All Datarooms');
    // Filter by near capacity
    fireEvent.change(select, { target: { value: 'near_capacity' } });

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
      expect(screen.queryByText('Legacy Deal Vault')).not.toBeInTheDocument();
    });

    // Filter by legacy v1
    fireEvent.change(select, { target: { value: 'legacy_v1' } });
    await waitFor(() => {
      expect(screen.queryByText('Series A Due Diligence')).not.toBeInTheDocument();
      expect(screen.getByText('Legacy Deal Vault')).toBeInTheDocument();
    });
  });

  it('toggles column sorting and passes ordering to backend', async () => {
    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const nameSortBtn = screen.getByRole('button', { name: /Dataroom Name/i });
    fireEvent.click(nameSortBtn);

    await waitFor(() => {
      expect(api.getAdminDatarooms).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: 'name' })
      );
    });

    fireEvent.click(nameSortBtn);

    await waitFor(() => {
      expect(api.getAdminDatarooms).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: '-name' })
      );
    });
  });

  it('opens TransferOwnershipDialog and routes through admin APIs', async () => {
    const user = userEvent.setup();
    api.getAdminEligibleCollaborators.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[0]);

    const transferOption = await screen.findByText('Transfer Dataroom Ownership');
    await user.click(transferOption);

    await waitFor(() => {
      expect(api.getAdminEligibleCollaborators).toHaveBeenCalledWith('droom-1', '');
    });
  });

  it('opens ManageCollaboratorsDialog and routes through admin APIs', async () => {
    const user = userEvent.setup();
    api.getAdminDataroomCollaborators.mockResolvedValue({ data: { collaborators: [], total_count: 0 } });
    api.getAdminEligibleCollaborators.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[0]);

    const collabOption = await screen.findByText('Manage Collaborators');
    await user.click(collabOption);

    await waitFor(() => {
      expect(api.getAdminDataroomCollaborators).toHaveBeenCalledWith('droom-1');
    });
  });

  it('opens and updates storage quota via AdjustStorageQuotaDialog', async () => {
    const user = userEvent.setup();
    api.updateAdminDataroom.mockResolvedValue({ data: { ...mockDatarooms[0], storage_quota_mb: 2048 } });

    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    // Open actions menu for the first row
    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[0]);

    // Click Adjust Storage Quota
    const adjustOption = await screen.findByText('Adjust Storage Quota');
    await user.click(adjustOption);

    // Verify modal appears
    expect(screen.getByText('Current Storage Used')).toBeInTheDocument();

    // Click 5 GB preset pill
    const fiveGbPreset = screen.getByRole('button', { name: '5 GB' });
    await user.click(fiveGbPreset);

    // Save changes
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(api.updateAdminDataroom).toHaveBeenCalledWith('droom-1', { storage_quota_mb: 5120 });
      expect(toast.success).toHaveBeenCalledWith('Storage quota updated successfully.');
    });
  });

  it('rejects invalid, decimal, or non-integer quota values in AdjustStorageQuotaDialog', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[0]);

    const adjustOption = await screen.findByText('Adjust Storage Quota');
    await user.click(adjustOption);

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '12.5');

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(saveButton);

    expect(toast.error).toHaveBeenCalledWith('Please enter a valid positive number or 0 for unlimited.');
    expect(api.updateAdminDataroom).not.toHaveBeenCalled();
  });

  it('triggers storage upgrade for legacy v1 rooms', async () => {
    const user = userEvent.setup();
    api.upgradeAdminDataroomStorage.mockResolvedValue({
      data: { ...mockDatarooms[1], storage_version: 2 },
    });

    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Deal Vault')).toBeInTheDocument();
    });

    // Open actions menu for second row (Legacy v1)
    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[1]);

    const upgradeOption = await screen.findByText('Upgrade to Org-Scoped Storage');
    await user.click(upgradeOption);

    // Confirmation dialog appears
    expect(screen.getByText('Upgrade to Organization-Scoped Storage?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Upgrade Now' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.upgradeAdminDataroomStorage).toHaveBeenCalledWith('droom-2');
      expect(toast.success).toHaveBeenCalledWith('Dataroom upgraded to organization-scoped storage.');
    });
  });

  it('deletes dataroom via confirmation dialog', async () => {
    const user = userEvent.setup();
    api.deleteAdminDataroom.mockResolvedValue({});

    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Series A Due Diligence')).toBeInTheDocument();
    });

    const actionButtons = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionButtons[0]);

    const deleteOption = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteOption);

    // Confirm deletion in dialog
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.deleteAdminDataroom).toHaveBeenCalledWith('droom-1');
      expect(toast.success).toHaveBeenCalledWith('Dataroom deleted successfully.');
    });
  });

  it('prevents stale out-of-order responses from overwriting latest results', async () => {
    let slowResolve;
    let fastResolve;

    api.getAdminDatarooms.mockImplementation((params) => {
      if (params.page === 2 && !params.search) {
        return new Promise((resolve) => {
          slowResolve = () =>
            resolve({
              data: {
                results: [{ ...mockDatarooms[0], id: 'slow-p2', name: 'Stale Page 2 Item' }],
                count: 20,
                total_pages: 2,
                metrics: { total_rooms: 20, total_storage_bytes: 0, total_active_links: 0 },
              },
            });
        });
      }
      return new Promise((resolve) => {
        fastResolve = () =>
          resolve({
            data: {
              results: [{ ...mockDatarooms[0], id: 'fast-p1', name: 'Fresh Page 1 Item' }],
              count: 20,
              total_pages: 2,
              metrics: { total_rooms: 20, total_storage_bytes: 0, total_active_links: 0 },
            },
          });
      });
    });

    render(
      <MemoryRouter>
        <AdminDataroomsPage />
      </MemoryRouter>
    );

    // Initial page 1 load
    fastResolve();
    await waitFor(() => {
      expect(screen.getByText('Fresh Page 1 Item')).toBeInTheDocument();
    });

    // Go to page 2 (dispatches slow request)
    const nextBtn = screen.getByText('Next');
    fireEvent.click(nextBtn);

    // Now change search filter before page 2 resolves (dispatches fast request for page 1)
    const searchInput = screen.getByPlaceholderText(/Search rooms or owners/i);
    fireEvent.change(searchInput, { target: { value: 'Fresh' } });

    // Advance timers for debounce
    await waitFor(() => {
      expect(api.getAdminDatarooms).toHaveBeenCalledWith(expect.objectContaining({ search: 'Fresh' }));
    });

    // Fast search response resolves first
    fastResolve();
    await waitFor(() => {
      expect(screen.getByText('Fresh Page 1 Item')).toBeInTheDocument();
    });

    // Stale slow page 2 response resolves afterwards
    await act(async () => {
      slowResolve();
    });

    // Verify stale item did NOT overwrite fresh page 1 item
    expect(screen.getByText('Fresh Page 1 Item')).toBeInTheDocument();
    expect(screen.queryByText('Stale Page 2 Item')).not.toBeInTheDocument();
  });
});
