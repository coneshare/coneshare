import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { AddToDataroomsDialog } from '../../../components/dialogs/AddToDataroomsDialog';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  getDatarooms: vi.fn(),
  addContentToDataroom: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

const mockDatarooms = [
  { id: 'dr_1', name: 'Series A Room' },
  { id: 'dr_2', name: 'Partner Room' },
  { id: 'dr_3', name: 'Board Materials' },
];

describe('AddToDataroomsDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    api.getDatarooms.mockResolvedValue({ data: mockDatarooms });
  });

  const renderDialog = (props = {}) =>
    render(
      <AddToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        items={{
          folders: [{ id: 'f_1', name: 'Legal Docs', synced_datarooms: [] }],
          documents: [],
        }}
        onSuccess={mockOnSuccess}
        {...props}
      />
    );

  it('loads datarooms, filters by search, and submits folder payload with skipErrorToast', async () => {
    api.addContentToDataroom.mockResolvedValue({ data: { detail: 'Content added successfully.' } });
    const user = userEvent.setup();
    renderDialog();

    expect(await screen.findByText('Series A Room')).toBeInTheDocument();
    expect(screen.getByText('Partner Room')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search datarooms');
    await user.type(searchInput, 'Partner');
    expect(screen.queryByText('Series A Room')).not.toBeInTheDocument();
    expect(screen.getByText('Partner Room')).toBeInTheDocument();

    await user.clear(searchInput);
    await user.click(screen.getByRole('checkbox', { name: /Series A Room/ }));
    await user.click(screen.getByRole('checkbox', { name: /Partner Room/ }));

    // Enable folder sync toggle
    const syncCheckbox = screen.getByRole('checkbox', { name: 'Keep selected folders synced with Documents' });
    expect(syncCheckbox).not.toBeChecked();
    await user.click(syncCheckbox);

    await user.click(screen.getByRole('button', { name: 'Add to Datarooms' }));

    await waitFor(() => {
      expect(api.addContentToDataroom).toHaveBeenCalledTimes(2);
    });
    expect(api.addContentToDataroom).toHaveBeenCalledWith(
      'dr_1',
      { folder_ids: ['f_1'], document_ids: [], sync_folders: true },
      { skipErrorToast: true }
    );
    expect(api.addContentToDataroom).toHaveBeenCalledWith(
      'dr_2',
      { folder_ids: ['f_1'], document_ids: [], sync_folders: true },
      { skipErrorToast: true }
    );
    expect(toast.success).toHaveBeenCalled();
    expect(mockOnSuccess).toHaveBeenCalledWith({ syncedFoldersUsed: true, allSucceeded: true });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('hides sync toggle for document-only selection and shows mixed hint when both are selected', async () => {
    const { rerender } = renderDialog({
      items: {
        folders: [],
        documents: [{ id: 'doc_1', name: 'Pitch.pdf' }],
      },
    });

    expect(await screen.findByText('Series A Room')).toBeInTheDocument();
    expect(screen.queryByText('Keep selected folders synced with Documents')).not.toBeInTheDocument();

    rerender(
      <AddToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        items={{
          folders: [{ id: 'f_1', name: 'Legal', synced_datarooms: [] }],
          documents: [{ id: 'doc_1', name: 'Pitch.pdf' }],
        }}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Keep selected folders synced with Documents')).toBeInTheDocument();
    expect(
      screen.getByText('Sync applies to selected folders only. Selected documents stay live-linked.')
    ).toBeInTheDocument();
  });

  it('shows non-blocking sync hint with distinct folder count when already synced', async () => {
    renderDialog({
      items: {
        folders: [
          {
            id: 'f_1',
            name: 'Images',
            synced_datarooms: [
              { dataroom_id: 'dr_1', dataroom_folder_path: '/Images' },
              { dataroom_id: 'dr_1', dataroom_folder_path: '/Archive/Images' },
            ],
          },
          {
            id: 'f_2',
            name: 'Contracts',
            synced_datarooms: [],
          },
        ],
        documents: [],
      },
    });

    expect(await screen.findByText('Series A Room')).toBeInTheDocument();
    // Must count distinct selected folder IDs (1 of 2), not raw synced_datarooms rows (2 of 2)
    expect(screen.getByText('1 of 2 selected folder already synced here')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Series A Room/ })).not.toBeDisabled();
  });

  it('shows single-folder synced paths without disabling dataroom selection', async () => {
    renderDialog({
      items: {
        folders: [
          {
            id: 'f_1',
            name: 'Legal',
            synced_datarooms: [{ dataroom_id: 'dr_1', dataroom_folder_path: '/A/Legal' }],
          },
        ],
        documents: [],
      },
    });

    expect(await screen.findByText('Already synced at /A/Legal')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Series A Room/ })).not.toBeDisabled();
  });

  it('handles partial failure cleanly, preserves state across refresh, disables succeeded rows, and retries failed only', async () => {
    const user = userEvent.setup();
    api.addContentToDataroom
      .mockResolvedValueOnce({ data: { detail: 'ok' } })
      .mockRejectedValueOnce({
        response: { status: 400, data: { detail: 'Adding these items would exceed the Dataroom storage limit.' } },
      })
      .mockResolvedValueOnce({ data: { detail: 'ok' } });

    const { rerender } = renderDialog();
    expect(await screen.findByText('Series A Room')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Series A Room/ }));
    await user.click(screen.getByRole('checkbox', { name: /Partner Room/ }));
    await user.click(screen.getByRole('button', { name: 'Add to Datarooms' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Partner Room:');
    expect(toast.warning).toHaveBeenCalled();
    expect(mockOnSuccess).toHaveBeenCalledWith({ syncedFoldersUsed: false, allSucceeded: false });
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);

    // Simulate parent background refresh enriching items with updated synced_datarooms
    rerender(
      <AddToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        items={{
          folders: [
            {
              id: 'f_1',
              name: 'Legal Docs',
              synced_datarooms: [{ dataroom_id: 'dr_1', dataroom_folder_path: '/Legal Docs' }],
            },
          ],
          documents: [],
        }}
        onSuccess={mockOnSuccess}
      />
    );

    // Succeeded room is unchecked+disabled as Added; failed Partner Room remains checked for retry; alert preserved
    const dr1Checkbox = screen.getByRole('checkbox', { name: /Series A Room/ });
    const dr2Checkbox = screen.getByRole('checkbox', { name: /Partner Room/ });
    expect(dr1Checkbox).not.toBeChecked();
    expect(dr1Checkbox).toBeDisabled();
    expect(dr2Checkbox).toBeChecked();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Partner Room:');

    // Unchecking the remaining failed room disables submit because pendingSelectedIds is 0
    await user.click(dr2Checkbox);
    expect(screen.getByRole('button', { name: 'Add to Datarooms' })).toBeDisabled();

    // Select all only selects remaining pending datarooms (Partner Room & Board Materials), not Series A Room
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(dr1Checkbox).toBeDisabled();
    expect(dr1Checkbox).not.toBeChecked();
    expect(dr2Checkbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Board Materials/ })).toBeChecked();

    // Uncheck Board Materials, retry only Partner Room
    await user.click(screen.getByRole('checkbox', { name: /Board Materials/ }));
    await user.click(screen.getByRole('button', { name: 'Add to Datarooms' }));

    await waitFor(() => {
      expect(api.addContentToDataroom).toHaveBeenCalledTimes(3);
    });
    expect(api.addContentToDataroom).toHaveBeenLastCalledWith(
      'dr_2',
      { folder_ids: ['f_1'], document_ids: [], sync_folders: false },
      { skipErrorToast: true }
    );
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('ignores stale fetch responses when closed and reopened quickly', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    api.getDatarooms
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({ data: [{ id: 'dr_fresh', name: 'Fresh Room' }] });

    const { rerender } = renderDialog();
    rerender(
      <AddToDataroomsDialog
        isOpen={false}
        onOpenChange={mockOnOpenChange}
        items={{ folders: [{ id: 'f_1', name: 'Legal Docs' }], documents: [] }}
        onSuccess={mockOnSuccess}
      />
    );
    rerender(
      <AddToDataroomsDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        items={{ folders: [{ id: 'f_1', name: 'Legal Docs' }], documents: [] }}
        onSuccess={mockOnSuccess}
      />
    );

    expect(await screen.findByText('Fresh Room')).toBeInTheDocument();
    resolveFirst({ data: [{ id: 'dr_stale', name: 'Stale Room' }] });

    await waitFor(() => {
      expect(screen.queryByText('Stale Room')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Fresh Room')).toBeInTheDocument();
  });

  it('allows retrying when datarooms list fails to load', async () => {
    const user = userEvent.setup();
    api.getDatarooms
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: [{ id: 'dr_1', name: 'Recovered Room' }] });

    renderDialog();

    expect(await screen.findByText('Failed to load datarooms.')).toBeInTheDocument();
    expect(api.getDatarooms).toHaveBeenCalledWith(undefined, { skipErrorToast: true });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recovered Room')).toBeInTheDocument();
  });
});
