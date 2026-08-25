import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoveItemsDialog } from '../../../components/dialogs/MoveItemsDialog';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  createFolder: vi.fn(),
  getRootFolderContents: vi.fn().mockResolvedValue({ data: { sub_folders: [], documents: [] } }),
  getFolderContents: vi.fn().mockResolvedValue({ data: { sub_folders: [], documents: [] } }),
}));

describe('MoveItemsDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders move dialog with destination selection and actions', () => {
    render(
      <MoveItemsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByText('Move Items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Folder' })).toBeInTheDocument();
  });

  it('disables buttons and prevents duplicate submissions during move', async () => {
    let resolvePromise;
    const slowOnConfirm = vi.fn(() => new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    render(
      <MoveItemsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={slowOnConfirm}
      />
    );

    const moveBtn = screen.getByRole('button', { name: 'Move' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const createFolderBtn = screen.getByRole('button', { name: 'New Folder' });

    // First click
    fireEvent.click(moveBtn);

    // Should enter moving state immediately
    await waitFor(() => {
      expect(screen.getByText('Moving...')).toBeInTheDocument();
    });

    const movingBtn = screen.getByRole('button', { name: /moving/i });
    expect(movingBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    expect(createFolderBtn).toBeDisabled();

    // Second click while in flight should not trigger another call
    fireEvent.click(movingBtn);
    expect(slowOnConfirm).toHaveBeenCalledTimes(1);

    // Complete the move
    resolvePromise();

    await waitFor(() => {
      expect(screen.queryByText('Moving...')).not.toBeInTheDocument();
    });
  });
});
