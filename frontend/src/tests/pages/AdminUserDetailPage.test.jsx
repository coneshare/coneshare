import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminUserDetailPage } from '../../pages/AdminUserDetailPage';
import * as api from '../../services/api';
import { toast } from 'sonner';
import '../../i18n';

vi.mock('../../services/api', () => ({
  getAdminUserDetails: vi.fn(),
  getAdminUserShareLinks: vi.fn(),
  getAdminUserDatarooms: vi.fn(),
  recalculateAdminUserQuota: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockUser = {
  id: 'user-123',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'member',
  is_active: true,
  file_size_quota_mb: 100,
  custom_file_size_quota_mb: null,
  total_document_size: 50 * 1024 * 1024, // 50MB
  max_files_per_upload: 10,
  date_joined: '2026-06-01T00:00:00Z',
  total_views: 12,
  total_links: 3,
  total_datarooms: 1,
};

describe('AdminUserDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getAdminUserDetails.mockResolvedValue({ data: mockUser });
    api.getAdminUserShareLinks.mockResolvedValue({ data: { results: [] } });
    api.getAdminUserDatarooms.mockResolvedValue({ data: { results: [] } });
  });

  it('renders user details and storage quota info', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/users/user-123']}>
        <Routes>
          <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Jane Doe');
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('50 MB / 100 MB')).toBeInTheDocument();
    expect(screen.getByText('Recalculate Usage')).toBeInTheDocument();
  });

  it('successfully recalculates storage quota when button is clicked', async () => {
    const updatedUser = {
      ...mockUser,
      total_document_size: 25 * 1024 * 1024, // Recalculated to 25MB
    };
    api.recalculateAdminUserQuota.mockResolvedValueOnce({ data: updatedUser });

    render(
      <MemoryRouter initialEntries={['/admin/users/user-123']}>
        <Routes>
          <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Jane Doe');
    const recalculateBtn = screen.getByRole('button', { name: /recalculate usage/i });
    fireEvent.click(recalculateBtn);

    expect(api.recalculateAdminUserQuota).toHaveBeenCalledWith('user-123');

    await waitFor(() => {
      expect(screen.getByText('25 MB / 100 MB')).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith('Storage quota recalculated successfully.');
    });
  });

  it('shows error toast when recalculation fails', async () => {
    api.recalculateAdminUserQuota.mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter initialEntries={['/admin/users/user-123']}>
        <Routes>
          <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText('Jane Doe');
    const recalculateBtn = screen.getByRole('button', { name: /recalculate usage/i });
    fireEvent.click(recalculateBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to recalculate storage quota.');
    });
  });
});
