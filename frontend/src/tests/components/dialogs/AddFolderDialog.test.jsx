import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddFolderDialog } from '../../../components/dialogs/AddFolderDialog';
import '../../../i18n';

describe('AddFolderDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(
      <AddFolderDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByText('Create New Folder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter folder name...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Folder' })).toBeDisabled();
  });

  it('enables submit button only when a non-empty name is entered', async () => {
    const user = userEvent.setup();
    render(
      <AddFolderDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const input = screen.getByPlaceholderText('Enter folder name...');
    const submitBtn = screen.getByRole('button', { name: 'New Folder' });

    expect(submitBtn).toBeDisabled();

    await user.type(input, '   ');
    expect(submitBtn).toBeDisabled();

    await user.type(input, 'Investor Opportunity');
    expect(submitBtn).toBeEnabled();
  });

  it('disables button, input, and prevents duplicate submissions during submit', async () => {
    let resolvePromise;
    const slowOnConfirm = vi.fn(() => new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    const user = userEvent.setup();
    render(
      <AddFolderDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={slowOnConfirm}
      />
    );

    const input = screen.getByPlaceholderText('Enter folder name...');
    await user.type(input, 'My New Folder');

    const submitBtn = screen.getByRole('button', { name: 'New Folder' });
    
    // First click
    fireEvent.click(submitBtn);

    // Should immediately enter submitting state
    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });

    const creatingBtn = screen.getByRole('button', { name: /creating/i });
    expect(creatingBtn).toBeDisabled();
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    // Second click while in flight should not trigger another call
    fireEvent.click(creatingBtn);
    expect(slowOnConfirm).toHaveBeenCalledTimes(1);
    expect(slowOnConfirm).toHaveBeenCalledWith('My New Folder');

    // Resolve the promise
    resolvePromise();

    await waitFor(() => {
      expect(screen.queryByText('Creating...')).not.toBeInTheDocument();
    });
  });
});
