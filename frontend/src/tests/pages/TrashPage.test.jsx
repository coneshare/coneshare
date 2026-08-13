import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '../../services/api';
import TrashPage from '../../pages/TrashPage';

vi.mock('../../services/api');

vi.mock('sonner', async () => {
  const actual = await vi.importActual('sonner');
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('../../contexts/UserProvider', () => ({
  useUser: () => ({
    refreshUser: vi.fn(),
  }),
}));

describe('TrashPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders empty trash state when no deleted items exist', async () => {
    api.getTrashItems.mockResolvedValue({ data: { results: [] } });

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
      expect(screen.getByText('Items you delete will appear here.')).toBeInTheDocument();
    });
  });

  it('renders trash items when returned from API', async () => {
    const mockItems = [
      {
        id: '1',
        name: 'Deleted Doc.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 1024,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 5,
      },
    ];
    api.getTrashItems.mockResolvedValue({ data: { results: mockItems } });

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Deleted Doc.pdf')).toBeInTheDocument();
      expect(screen.getByText('Root')).toBeInTheDocument();
    });
  });

  it('permanently deletes an item and displays translated feedback toast', async () => {
    const mockItem = {
      id: '1',
      name: 'DocToDelete.pdf',
      item_type: 'document',
      file_type: 'pdf',
      size: 1024,
      deleted_at: new Date().toISOString(),
      parent_name: '__root__',
      parent_id: 'root',
      view_count: 5,
    };
    api.getTrashItems.mockResolvedValue({ data: { results: [mockItem] } });
    api.permanentDeleteTrashItem.mockResolvedValue({});

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DocToDelete.pdf')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteBtn);

    const confirmBtn = screen.getByRole('button', { name: 'Delete Permanently' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.permanentDeleteTrashItem).toHaveBeenCalledWith('1');
      expect(toast.success).toHaveBeenCalledWith('"DocToDelete.pdf" permanently deleted');
    });
  });
});
