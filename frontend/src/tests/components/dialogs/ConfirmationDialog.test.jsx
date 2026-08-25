import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from '../../../components/dialogs/ConfirmationDialog';
import '../../../i18n';

describe('ConfirmationDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, description, and action buttons', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        title="Delete Selected Items"
        description="Are you sure you want to delete these items?"
        onConfirm={mockOnConfirm}
        confirmText="Delete"
        cancelText="Cancel"
      />
    );

    expect(screen.getByText('Delete Selected Items')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete these items?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('disables buttons and prevents duplicate submissions during async onConfirm', async () => {
    let resolvePromise;
    const slowOnConfirm = vi.fn(() => new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    render(
      <ConfirmationDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        title="Delete Selected Items"
        description="Are you sure you want to delete these items?"
        onConfirm={slowOnConfirm}
        confirmText="Delete"
      />
    );

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });

    // First click
    fireEvent.click(deleteBtn);

    // Buttons should become disabled immediately
    await waitFor(() => {
      expect(deleteBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
    });

    // Second click while in flight should not trigger another call
    fireEvent.click(deleteBtn);
    expect(slowOnConfirm).toHaveBeenCalledTimes(1);

    // Complete the operation
    resolvePromise();

    await waitFor(() => {
      expect(deleteBtn).not.toBeDisabled();
      expect(cancelBtn).not.toBeDisabled();
    });
  });

  it('respects external isLoading prop if provided', () => {
    render(
      <ConfirmationDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        title="Delete Selected Items"
        description="Are you sure?"
        onConfirm={mockOnConfirm}
        confirmText="Delete"
        isLoading={true}
      />
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('disables buttons during async confirmation even if external isLoading={false} was passed', async () => {
    let resolvePromise;
    const slowOnConfirm = vi.fn(() => new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    render(
      <ConfirmationDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        title="Delete Selected Items"
        description="Are you sure?"
        onConfirm={slowOnConfirm}
        confirmText="Delete"
        isLoading={false}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });

    expect(deleteBtn).not.toBeDisabled();
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
    });

    fireEvent.click(deleteBtn);
    expect(slowOnConfirm).toHaveBeenCalledTimes(1);

    resolvePromise();
    await waitFor(() => {
      expect(deleteBtn).not.toBeDisabled();
    });
  });
});
