import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RenameItemDialog } from '../../../components/dialogs/RenameItemDialog';
import * as api from '../../../services/api';
import i18n from '../../../i18n';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  renameDocument: vi.fn(),
  renameFolder: vi.fn(),
  updateDataroom: vi.fn(),
  renameDataroomFolder: vi.fn(),
  renameDataroomDocument: vi.fn(),
}));

describe('RenameItemDialog', () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockItem = { id: 'doc-1', name: 'Original.pdf', type: 'document' };

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('renders rename dialog with current item name', () => {
    render(
      <RenameItemDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        item={mockItem}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Original.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('disables buttons and input during async save, preventing duplicate requests', async () => {
    let resolvePromise;
    api.renameDocument.mockReturnValue(new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    const user = userEvent.setup();
    render(
      <RenameItemDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        item={mockItem}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByDisplayValue('Original.pdf');
    await user.clear(input);
    await user.type(input, 'Renamed.pdf');

    const renameBtn = screen.getByRole('button', { name: 'Rename' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });

    // First click
    fireEvent.click(renameBtn);

    // Should enter saving state
    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    const savingBtn = screen.getByRole('button', { name: /saving/i });
    expect(savingBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    expect(input).toBeDisabled();

    // Second click while in flight
    fireEvent.click(savingBtn);
    expect(api.renameDocument).toHaveBeenCalledTimes(1);
    expect(api.renameDocument).toHaveBeenCalledWith('doc-1', 'Renamed.pdf');

    // Complete the request
    resolvePromise({ data: {} });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('displays localized success toast in Simplified Chinese when renaming dataroom', async () => {
    await i18n.changeLanguage('zh-hans');
    api.updateDataroom.mockResolvedValue({ data: {} });

    const user = userEvent.setup();
    render(
      <RenameItemDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        item={{ id: 'dr-1', name: 'alpha 项目', type: 'Dataroom' }}
        onSuccess={mockOnSuccess}
        context="dataroom"
      />
    );

    const input = screen.getByDisplayValue('alpha 项目');
    await user.clear(input);
    await user.type(input, 'alpha 项目 x');

    const renameBtn = screen.getByRole('button', { name: /重命名/i });
    fireEvent.click(renameBtn);

    await waitFor(() => {
      expect(api.updateDataroom).toHaveBeenCalledWith('dr-1', { name: 'alpha 项目 x' });
      expect(toast.success).toHaveBeenCalledWith('“alpha 项目”已重命名为“alpha 项目 x”。');
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
