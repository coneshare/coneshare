import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataroomMoveItemsDialog } from '../../../components/dialogs/DataroomMoveItemsDialog';
import * as api from '../../../services/api';
import '../../../i18n';

// Mocks
vi.mock('../../../services/api');

const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('DataroomMoveItemsDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  const mockDataroomRoot = {
    id: 'dr_123',
    name: 'Test Dataroom',
    items: [
      { id: 'folder_root_1', name: 'Financials', type: 'folder' },
      { id: 'folder_root_2', name: 'Legal', type: 'folder' },
      { id: 'doc_root_1', name: 'PitchDeck.pdf', type: 'document' },
    ],
  };

  const mockSubFolderContent = {
    id: 'folder_root_1',
    name: 'Financials',
    ancestors: [],
    sub_folders: [
      { id: 'folder_child_1', name: 'Q1 Reports', parent: 'folder_root_1' },
      { id: 'folder_child_2', name: 'Q2 Reports', parent: 'folder_root_1' },
    ],
    items: [
      { id: 'folder_child_1', name: 'Q1 Reports', type: 'folder' },
      { id: 'folder_child_2', name: 'Q2 Reports', type: 'folder' },
      { id: 'doc_child_1', name: 'Summary.xlsx', type: 'document' },
    ],
  };

  const mockEmptySubFolderContent = {
    id: 'folder_child_1',
    name: 'Q1 Reports',
    ancestors: [{ id: 'folder_root_1', name: 'Financials' }],
    sub_folders: [],
    items: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.getDataroom.mockResolvedValue({ data: mockDataroomRoot });
    api.getDataroomFolderContents.mockResolvedValue({ data: mockSubFolderContent });
    mockOnConfirm.mockResolvedValue(undefined);
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onOpenChange: mockOnOpenChange,
      onConfirm: mockOnConfirm,
      dataroomId: 'dr_123',
      selectedFolderIds: [],
    };
    return render(<DataroomMoveItemsDialog {...defaultProps} {...props} />);
  };

  it('correctly extracts and displays root folders from dataroom items list', async () => {
    renderComponent();

    // Verify loading state transitions to folder list
    expect(screen.getByText('Loading folders...')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getDataroom).toHaveBeenCalledWith('dr_123');
    });

    // Root folders should be displayed (not "No subfolders")
    expect(await screen.findByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    // Documents should be filtered out
    expect(screen.queryByText('PitchDeck.pdf')).not.toBeInTheDocument();
  });

  it('navigates into a subfolder and updates breadcrumbs', async () => {
    const user = userEvent.setup();
    renderComponent();

    const folderButton = await screen.findByText('Financials');
    await user.click(folderButton);

    await waitFor(() => {
      expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder_root_1');
    });

    // Subfolders should now be listed
    expect(await screen.findByText('Q1 Reports')).toBeInTheDocument();
    expect(screen.getByText('Q2 Reports')).toBeInTheDocument();

    // Breadcrumbs should show Dataroom Root and current folder
    expect(screen.getByRole('button', { name: 'Dataroom Root' })).toBeInTheDocument();
    expect(screen.getByText('Financials', { selector: 'span' })).toBeInTheDocument();
  });

  it('allows navigating back to Dataroom Root from breadcrumbs', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Navigate to Financials
    const folderButton = await screen.findByText('Financials');
    await user.click(folderButton);
    expect(await screen.findByText('Q1 Reports')).toBeInTheDocument();

    // Click Dataroom Root in breadcrumbs
    const rootBreadcrumb = screen.getByRole('button', { name: 'Dataroom Root' });
    await user.click(rootBreadcrumb);

    await waitFor(() => {
      expect(api.getDataroom).toHaveBeenCalledTimes(2);
    });

    // Should be back at Root
    expect(await screen.findByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  it('disables selectedFolderIds from being selected as destination', async () => {
    renderComponent({ selectedFolderIds: ['folder_root_1'] });

    const folder1 = await screen.findByText('Financials');
    const folder1Button = folder1.closest('button');
    expect(folder1Button).toBeDisabled();

    const folder2 = screen.getByText('Legal');
    const folder2Button = folder2.closest('button');
    expect(folder2Button).not.toBeDisabled();
  });

  it('confirms move to Root when on root level', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Financials');
    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    await user.click(moveHereBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith(null);
  });

  it('confirms move to subfolder when inside subfolder', async () => {
    const user = userEvent.setup();
    renderComponent();

    const folderButton = await screen.findByText('Financials');
    await user.click(folderButton);
    await screen.findByText('Q1 Reports');

    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    await user.click(moveHereBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith('folder_root_1');
  });

  it('displays "No subfolders" when a folder has no subfolders', async () => {
    api.getDataroomFolderContents.mockResolvedValue({ data: mockEmptySubFolderContent });
    const user = userEvent.setup();
    renderComponent();

    const folderButton = await screen.findByText('Financials');
    await user.click(folderButton);

    expect(await screen.findByText('No subfolders')).toBeInTheDocument();
  });

  it('ignores stale responses when navigating rapidly between folders', async () => {
    let resolveFirstRequest;
    const firstRequestPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve;
    });

    // Slow folder navigation request
    api.getDataroomFolderContents.mockReturnValue(firstRequestPromise);

    const user = userEvent.setup();
    renderComponent();

    // 1. Initial load shows root folders
    expect(await screen.findByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();

    // 2. User clicks Financials (triggers slow request 1)
    const financialsButton = screen.getByText('Financials');
    await user.click(financialsButton);

    // 3. User clicks Dataroom Root in breadcrumb before request 1 completes (triggers faster request 2)
    const rootBreadcrumb = screen.getByRole('button', { name: 'Dataroom Root' });
    await user.click(rootBreadcrumb);

    // Faster request 2 completes and displays root folders
    expect(await screen.findByText('Legal')).toBeInTheDocument();

    // 4. Stale request 1 (Financials subfolder contents) resolves afterwards
    resolveFirstRequest({ data: mockSubFolderContent });

    // Verify stale response did not overwrite Root view
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.queryByText('Q1 Reports')).not.toBeInTheDocument();

    // Confirm move submits Root (null), not stale Financials folder
    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    await user.click(moveHereBtn);
    expect(mockOnConfirm).toHaveBeenCalledWith(null);
  });
});

