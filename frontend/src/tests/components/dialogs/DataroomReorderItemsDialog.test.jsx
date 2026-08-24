import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataroomReorderItemsDialog } from '../../../components/dialogs/DataroomReorderItemsDialog';
import '../../../i18n';

describe('DataroomReorderItemsDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  const mockItems = [
    { id: 'f1', name: 'Folder 1', type: 'folder' },
    { id: 'doc1', name: 'Doc 1.pdf', type: 'document' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders reorder dialog with item list and action buttons', () => {
    render(
      <DataroomReorderItemsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        items={mockItems}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByText('Reorder Items')).toBeInTheDocument();
    expect(screen.getByText('Folder 1')).toBeInTheDocument();
    expect(screen.getByText('Doc 1.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Order' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reset order/i })).toBeEnabled();
  });

  it('disables buttons and prevents duplicate submissions while saving order', async () => {
    let resolvePromise;
    const slowOnConfirm = vi.fn(() => new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    render(
      <DataroomReorderItemsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        items={mockItems}
        onConfirm={slowOnConfirm}
      />
    );

    const saveBtn = screen.getByRole('button', { name: 'Save Order' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const resetBtn = screen.getByRole('button', { name: /reset order/i });

    // First click
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    const savingBtn = screen.getByRole('button', { name: /saving/i });
    expect(savingBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    expect(resetBtn).toBeDisabled();

    // Reorder arrow buttons should all be disabled while saving
    const listItems = screen.getAllByRole('listitem');
    listItems.forEach((li) => {
      expect(li).toHaveAttribute('draggable', 'false');
    });

    // Second click while in flight
    fireEvent.click(savingBtn);
    expect(slowOnConfirm).toHaveBeenCalledTimes(1);

    // Complete saving
    resolvePromise();

    await waitFor(() => {
      expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    });
  });
});
