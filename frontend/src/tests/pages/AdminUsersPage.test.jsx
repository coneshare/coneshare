import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminUsersPage } from '../../pages/AdminUsersPage';
import * as api from '../../services/api';
import { toast } from 'sonner';
import '../../i18n';

vi.mock('../../services/api', () => ({
  getAdminUsers: vi.fn(),
  createAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
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

const mockUsers = [
  {
    id: 'user-1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    role: 'member',
    is_active: true,
    file_size_quota_mb: 100,
    custom_file_size_quota_mb: null,
    total_document_size: 10 * 1024 * 1024, // 10MB
    date_joined: '2026-07-01T00:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: 'admin',
    is_active: false,
    file_size_quota_mb: 50,
    custom_file_size_quota_mb: 50,
    total_document_size: 40 * 1024 * 1024, // 40MB
    date_joined: '2026-07-15T00:00:00Z',
  },
];

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getAdminUsers.mockResolvedValue({
      data: {
        count: 2,
        results: mockUsers,
      },
    });
  });

  it('renders users table with custom and global storage quotas', async () => {
    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    );

    // Verify it fetches users
    expect(api.getAdminUsers).toHaveBeenCalled();

    // Verify user details are rendered
    await screen.findByText('Alice Smith');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();

    // Alice has global/fallback quota of 100MB
    expect(screen.getByText('10 MB')).toBeInTheDocument();
    expect(screen.getByText('100 MB')).toBeInTheDocument();

    // Bob has custom quota of 50MB
    expect(screen.getByText('40 MB')).toBeInTheDocument();
    expect(screen.getByText('50 MB')).toBeInTheDocument();
  });

  it('allows inline editing and updating of custom storage quota', async () => {
    api.updateAdminUser.mockResolvedValue({
      data: {
        ...mockUsers[0],
        name: 'Alice Smith Updated',
        custom_file_size_quota_mb: 250,
        file_size_quota_mb: 250,
      },
    });

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    );

    // Wait for data load
    await screen.findByText('Alice Smith');

    // Click edit on the first user
    const editButtons = screen.getAllByTitle(/edit/i);
    fireEvent.click(editButtons[0]);

    // Name input should show the current name
    const nameInput = screen.getByDisplayValue('Alice Smith');
    fireEvent.change(nameInput, { target: { value: 'Alice Smith Updated' } });

    // Quota input should be available (rendered with placeholder "Default")
    const quotaInput = screen.getByPlaceholderText('Default');
    expect(quotaInput).toBeInTheDocument();
    fireEvent.change(quotaInput, { target: { value: '250' } });

    // Click Save
    const saveButton = screen.getByTitle(/save/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateAdminUser).toHaveBeenCalledWith('user-1', {
        name: 'Alice Smith Updated',
        role: 'member',
        is_active: true,
        custom_file_size_quota_mb: 250,
      });
      expect(toast.success).toHaveBeenCalledWith('User updated successfully.');
    });
  });

  it('allows adding a new user with a custom storage quota', async () => {
    api.createAdminUser.mockResolvedValue({
      data: {
        id: 'user-3',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        role: 'member',
        is_active: true,
        file_size_quota_mb: 300,
        custom_file_size_quota_mb: 300,
        total_document_size: 0,
        date_joined: new Date().toISOString(),
      },
    });

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    );

    // Click "Add User" button
    const addUserButton = await screen.findByRole('button', { name: /add user/i });
    fireEvent.click(addUserButton);

    // Fill in Add User form fields
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Charlie Brown' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'charlie@example.com' } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'charlie' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'supersecret' } });
    
    // Select custom storage quota
    const quotaInput = screen.getByLabelText(/storage quota/i);
    fireEvent.change(quotaInput, { target: { value: '300' } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: 'Add User' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.createAdminUser).toHaveBeenCalledWith({
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        username: 'charlie',
        password: 'supersecret',
        role: 'member',
        custom_file_size_quota_mb: 300,
      });
      expect(toast.success).toHaveBeenCalledWith("User 'Charlie Brown' created successfully.");
    });
  });

  it('renders pagination controls and fetches the next page on click', async () => {
    // Set count > pageSize (10) so that pagination is triggered
    api.getAdminUsers.mockResolvedValue({
      data: {
        count: 25,
        results: mockUsers,
      },
    });

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    );

    // Wait for the initial page to load
    await screen.findByText('Alice Smith');

    // Pagination should be visible since count (25) > pageSize (10)
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    // Click "Next" to go to page 2
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(api.getAdminUsers).toHaveBeenCalledWith(2);
    });
  });

  it('disables Add User button and inputs while creating a user', async () => {
    let resolveCreate;
    api.createAdminUser.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    );

    const addUserButton = await screen.findByRole('button', { name: /add user/i });
    fireEvent.click(addUserButton);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Charlie Brown' } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'charlie@example.com' } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'charlie' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'supersecret' } });

    const submitButton = screen.getByRole('button', { name: 'Add User' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    // First click
    fireEvent.click(submitButton);

    expect(api.createAdminUser).toHaveBeenCalledTimes(1);
    expect(submitButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    expect(screen.getByLabelText(/full name/i)).toBeDisabled();

    // Second click during in-flight
    fireEvent.click(submitButton);
    expect(api.createAdminUser).toHaveBeenCalledTimes(1);

    resolveCreate({
      data: {
        id: 'user-3',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        role: 'member',
        is_active: true,
        file_size_quota_mb: 100,
        custom_file_size_quota_mb: null,
        total_document_size: 0,
        date_joined: new Date().toISOString(),
      },
    });
  });

  it('disables inline save button and inputs while saving', async () => {
    let resolveUpdate;
    api.updateAdminUser.mockReturnValue(new Promise((resolve) => {
      resolveUpdate = resolve;
    }));

    render(
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    );

    await screen.findByText('Alice Smith');

    const editButtons = screen.getAllByTitle(/edit/i);
    fireEvent.click(editButtons[0]);

    const saveButton = screen.getByTitle(/save/i);
    const cancelButton = screen.getByTitle(/cancel/i);

    // First click
    fireEvent.click(saveButton);

    expect(api.updateAdminUser).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    // Other rows' Edit buttons should also be disabled while saving
    screen.getAllByTitle(/edit/i).forEach((btn) => {
      expect(btn).toBeDisabled();
    });

    // Second click
    fireEvent.click(saveButton);
    expect(api.updateAdminUser).toHaveBeenCalledTimes(1);

    resolveUpdate({
      data: {
        ...mockUsers[0],
        name: 'Alice Smith Updated',
      },
    });
  });
});
