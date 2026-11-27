import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { SyncFolderToDataroomsDialog } from '../../../components/dialogs/SyncFolderToDataroomsDialog';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  syncFolderToDatarooms: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFolder = {
  id: 'folder_1',
  name: 'Legal Docs',
  synced_datarooms: [
    {
      dataroom_id: 'dr_1',
      dataroom_name: 'Series A Room',
      dataroom_folder_id: 'df_1',
      dataroom_folder_path: '/Legal Docs',
      last_synced_at: '2026-11-24T10:00:00Z',
    },
    {
      dataroom_id: 'dr_2',
      dataroom_name: 'Partner Room',
      dataroom_folder_id: 'df_2',
      dataroom_folder_path: '/Shared/Legal Docs',
      last_synced_at: null,
    },
  ],
};

describe('SyncFolderToDataroomsDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDialog = (props = {}) =>
    render(
      <SyncFolderToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        folder={mockFolder}
        onSuccess={mockOnSuccess}
        {...props}
      />
    );

  it('lists linked datarooms and pushes to selected targets', async () => {
    api.syncFolderToDatarooms.mockResolvedValue({
      data: { synced_count: 1, failed_count: 0, results: [] },
    });
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText('Series A Room')).toBeInTheDocument();
    expect(screen.getByText('/Legal Docs')).toBeInTheDocument();
    expect(screen.getByText('Partner Room')).toBeInTheDocument();
    expect(screen.getByText('/Shared/Legal Docs')).toBeInTheDocument();

    const partnerCheckbox = screen.getByRole('checkbox', { name: 'Partner Room (/Shared/Legal Docs)' });
    expect(partnerCheckbox).toBeChecked();
    await user.click(partnerCheckbox);
    expect(partnerCheckbox).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Sync Now' }));

    await waitFor(() => {
      expect(api.syncFolderToDatarooms).toHaveBeenCalledWith('folder_1', {
        dataroom_folder_ids: ['df_1'],
      });
    });
    expect(toast.success).toHaveBeenCalled();
    expect(mockOnSuccess).toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables submit when all targets are deselected and supports toggle all', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Deselect all' }));
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Sync Now' })).not.toBeDisabled();
  });

  it('shows inline alert with all per-room errors on HTTP 400 and preserves alert on folder refresh', async () => {
    api.syncFolderToDatarooms.mockRejectedValue({
      response: {
        data: {
          detail: 'Syncing this folder would exceed the Dataroom storage limit of 10 MB.',
          synced_count: 0,
          failed_count: 2,
          results: [
            {
              dataroom_id: 'dr_1',
              dataroom_name: 'Series A Room',
              dataroom_folder_id: 'df_1',
              status: 'error',
              detail: 'Syncing this folder would exceed the Dataroom storage limit of 10 MB.',
            },
            {
              dataroom_id: 'dr_2',
              dataroom_name: 'Partner Room',
              dataroom_folder_id: 'df_2',
              status: 'error',
              detail: 'Syncing this folder would exceed the Dataroom storage limit of 25 MB.',
            },
          ],
        },
      },
    });
    const user = userEvent.setup();
    const { rerender } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Sync Now' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Series A Room');
    expect(alert).toHaveTextContent('10 MB');
    expect(alert).toHaveTextContent('Partner Room');
    expect(alert).toHaveTextContent('25 MB');
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);

    // Rerendering with updated synced_datarooms snapshot for the same folder keeps alert intact
    rerender(
      <SyncFolderToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        folder={{
          ...mockFolder,
          synced_datarooms: [
            { ...mockFolder.synced_datarooms[0], last_synced_at: new Date().toISOString() },
            mockFolder.synced_datarooms[1],
          ],
        }}
        onSuccess={mockOnSuccess}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Partner Room');
  });

  it('scopes sync completion, errors, and locking to the dialog session that started the request', async () => {
    let resolveFolderA;
    let rejectFolderA;
    api.syncFolderToDatarooms
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFolderA = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFolderA = reject;
          })
      );

    const folderB = {
      id: 'folder_2',
      name: 'Board Decks',
      synced_datarooms: [
        {
          dataroom_id: 'dr_3',
          dataroom_name: 'Board Room',
          dataroom_folder_id: 'df_3',
          dataroom_folder_path: '/Board Decks',
          last_synced_at: null,
        },
      ],
    };

    const user = userEvent.setup();
    const { rerender } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Sync Now' }));
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled();

    // Simulate route navigation clearing the dialog while A is pending, then opening B
    rerender(
      <SyncFolderToDataroomsDialog
        isOpen={false}
        onOpenChange={mockOnOpenChange}
        folder={null}
        onSuccess={mockOnSuccess}
      />
    );
    rerender(
      <SyncFolderToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        folder={folderB}
        onSuccess={mockOnSuccess}
      />
    );

    // B opens clean and unlocked while A is still pending
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    // A completes with full success: must not close B
    resolveFolderA({ data: { synced_count: 2, failed_count: 0, results: [] } });
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);

    // Start another sync on folder A, close/switch to B while pending, then reject A
    rerender(
      <SyncFolderToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        folder={mockFolder}
        onSuccess={mockOnSuccess}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Sync Now' }));
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled();

    rerender(
      <SyncFolderToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        folder={folderB}
        onSuccess={mockOnSuccess}
      />
    );
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeEnabled();

    rejectFolderA({
      response: {
        data: {
          results: [
            {
              dataroom_id: 'dr_1',
              dataroom_name: 'Series A Room',
              dataroom_folder_id: 'df_1',
              status: 'error',
              detail: 'Syncing this folder would exceed the Dataroom storage limit of 10 MB.',
            },
          ],
        },
      },
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Sync Now' })).toBeEnabled();
  });
});
