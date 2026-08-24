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

  it('disables restore button and prevents duplicate requests while restoring an item', async () => {
    const mockItem = {
      id: 'item-1',
      name: 'DocToRestore.pdf',
      item_type: 'document',
      file_type: 'pdf',
      size: 1024,
      deleted_at: new Date().toISOString(),
      parent_name: '__root__',
      parent_id: 'root',
      view_count: 5,
    };
    api.getTrashItems.mockResolvedValue({ data: { results: [mockItem] } });

    let resolveRestore;
    api.restoreTrashItem.mockReturnValue(new Promise((resolve) => {
      resolveRestore = resolve;
    }));

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DocToRestore.pdf')).toBeInTheDocument();
    });

    const restoreBtn = screen.getByRole('button', { name: /Restore/i });

    // First click
    fireEvent.click(restoreBtn);

    expect(api.restoreTrashItem).toHaveBeenCalledTimes(1);
    expect(restoreBtn).toBeDisabled();

    // Second click during in-flight restore
    fireEvent.click(restoreBtn);
    expect(api.restoreTrashItem).toHaveBeenCalledTimes(1);

    resolveRestore({ data: { detail: 'Restored successfully' } });
  });

  it('disables inspect dialog actions and prevents concurrent restore when another item is restoring', async () => {
    const mockItems = [
      {
        id: 'item-1',
        name: 'DocA.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 1024,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 1,
      },
      {
        id: 'item-2',
        name: 'DocB.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 2048,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 2,
      },
    ];
    api.getTrashItems.mockResolvedValue({ data: { results: mockItems } });

    let resolveRestore;
    api.restoreTrashItem.mockReturnValue(new Promise((resolve) => {
      resolveRestore = resolve;
    }));

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DocA.pdf')).toBeInTheDocument();
      expect(screen.getByText('DocB.pdf')).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole('button', { name: /Restore/i });

    // Restore Item A from table
    fireEvent.click(restoreButtons[0]);
    expect(api.restoreTrashItem).toHaveBeenCalledWith('item-1');
    expect(api.restoreTrashItem).toHaveBeenCalledTimes(1);

    // Open inspect modal for Item B
    fireEvent.click(screen.getByText('DocB.pdf'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Both restore and delete buttons inside inspect dialog should be disabled
    const modalRestoreBtn = screen.getByRole('button', { name: /Restore Document/i });
    const modalDeleteBtn = screen.getByRole('button', { name: /Delete Permanently/i });

    expect(modalRestoreBtn).toBeDisabled();
    expect(modalDeleteBtn).toBeDisabled();

    // Clicking restore on Item B should not trigger a second API call
    fireEvent.click(modalRestoreBtn);
    expect(api.restoreTrashItem).toHaveBeenCalledTimes(1);

    resolveRestore({ data: { detail: 'Restored successfully' } });
  });

  it('performs bulk restore and bulk delete while preserving current page', async () => {
    const mockItems = [
      {
        id: 'item-1',
        name: 'DocA.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 1024,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 1,
      },
      {
        id: 'item-2',
        name: 'DocB.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 2048,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 2,
      },
    ];
    api.getTrashItems.mockResolvedValue({ data: { results: mockItems, count: 40 } });
    api.restoreTrashItem.mockResolvedValue({ data: { detail: 'Restored' } });
    api.permanentDeleteTrashItem.mockResolvedValue({});

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DocA.pdf')).toBeInTheDocument();
    });

    // Select all items
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);

    // Click bulk restore in header
    const bulkRestoreBtn = screen.getByRole('button', { name: /Restore Selected/i });
    fireEvent.click(bulkRestoreBtn);

    // Confirm in modal
    const confirmModalRestoreBtn = screen.getByRole('button', { name: /Restore/i, hidden: false });
    fireEvent.click(confirmModalRestoreBtn);

    await waitFor(() => {
      expect(api.restoreTrashItem).toHaveBeenCalledTimes(2);
      expect(api.getTrashItems).toHaveBeenCalledWith(1);
    });
  });

  it('disables bulk restore, bulk delete, and empty trash while single-item restore is in flight', async () => {
    const mockItems = [
      {
        id: 'item-1',
        name: 'DocA.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 1024,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 1,
      },
    ];
    api.getTrashItems.mockResolvedValue({ data: { results: mockItems, count: 1 } });

    let resolveRestore;
    api.restoreTrashItem.mockReturnValue(new Promise((resolve) => {
      resolveRestore = resolve;
    }));

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('DocA.pdf')).toBeInTheDocument();
    });

    // Select the item
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // Row checkbox

    const bulkRestoreBtn = screen.getByRole('button', { name: /Restore Selected/i });
    const bulkDeleteBtn = screen.getByRole('button', { name: /Delete Selected Permanently/i });
    const emptyTrashBtn = screen.getByRole('button', { name: /Empty Trash/i });

    expect(bulkRestoreBtn).toBeEnabled();
    expect(bulkDeleteBtn).toBeEnabled();
    expect(emptyTrashBtn).toBeEnabled();

    // Start single item restore
    const rowRestoreBtn = screen.getByRole('button', { name: /^Restore$/i });
    fireEvent.click(rowRestoreBtn);

    expect(api.restoreTrashItem).toHaveBeenCalledTimes(1);
    expect(rowRestoreBtn).toBeDisabled();

    // Verify bulk actions and empty trash are disabled during restore
    expect(bulkRestoreBtn).toBeDisabled();
    expect(bulkDeleteBtn).toBeDisabled();
    expect(emptyTrashBtn).toBeDisabled();

    // Attempting to click bulk restore while in flight should not open dialog or trigger additional API calls
    fireEvent.click(bulkRestoreBtn);
    expect(api.restoreTrashItem).toHaveBeenCalledTimes(1);

    resolveRestore({ data: { detail: 'Restored' } });

    await waitFor(() => {
      expect(rowRestoreBtn).not.toBeDisabled();
    });
  });
});
