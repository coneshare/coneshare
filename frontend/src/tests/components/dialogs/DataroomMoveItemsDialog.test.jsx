import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataroomMoveItemsDialog } from '../../../components/dialogs/DataroomMoveItemsDialog';
import * as api from '../../../services/api';
import '../../../i18n';

// Mocks
vi.mock('../../../services/api');

const ResizeObserverMock = vi.fn(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});
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

  it('selects folder as destination on single click without navigating into it', async () => {
    const user = userEvent.setup();
    renderComponent({ selectedCount: 2 });

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getAllByText('Home Directory').length).toBeGreaterThanOrEqual(1);

    const folderButton = await screen.findByText('Financials');
    await user.click(folderButton);

    // Selected state updates on the clicked folder
    expect(screen.getByText('Selected')).toBeInTheDocument();

    // Confirm move submits Financials folder id
    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    await user.click(moveHereBtn);
    expect(mockOnConfirm).toHaveBeenCalledWith('folder_root_1');
  });

  it('navigates into a subfolder and updates breadcrumbs', async () => {
    const user = userEvent.setup();
    renderComponent();

    const openButton = await screen.findByRole('button', { name: 'Open Financials' });
    await user.click(openButton);

    await waitFor(() => {
      expect(api.getDataroomFolderContents).toHaveBeenCalledWith('folder_root_1');
    });

    // Subfolders should now be listed
    expect(await screen.findByText('Q1 Reports')).toBeInTheDocument();
    expect(screen.getByText('Q2 Reports')).toBeInTheDocument();

    // Breadcrumbs should show Home and current folder
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Financials', { selector: 'span' })).toBeInTheDocument();
  });

  it('allows navigating back to Home from breadcrumbs', async () => {
    const user = userEvent.setup();
    renderComponent();

    // Navigate to Financials
    const openButton = await screen.findByRole('button', { name: 'Open Financials' });
    await user.click(openButton);
    expect(await screen.findByText('Q1 Reports')).toBeInTheDocument();

    // Click Home in breadcrumbs
    const rootBreadcrumb = screen.getByRole('button', { name: 'Home' });
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

  it('disables Move to Folder button when destination is the current directory', async () => {
    const user = userEvent.setup();
    renderComponent({ sourceFolderId: null });

    await screen.findByText('Financials');

    // At root, destination defaults to Home Directory (Current Location)
    expect(screen.getByText('Current Location')).toBeInTheDocument();
    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    expect(moveHereBtn).toBeDisabled();

    // Selecting a different folder enables Move to Folder
    const legalFolder = screen.getByText('Legal');
    await user.click(legalFolder);
    expect(moveHereBtn).not.toBeDisabled();

    // Selecting Home Directory again disables Move to Folder
    const homeBtn = screen.getByText('Home Directory').closest('button');
    await user.click(homeBtn);
    expect(moveHereBtn).toBeDisabled();
  });

  it('confirms move to Root when items are inside a subfolder', async () => {
    const user = userEvent.setup();
    renderComponent({ sourceFolderId: 'folder_root_1' });

    await screen.findByText('Financials');
    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    expect(moveHereBtn).not.toBeDisabled();
    await user.click(moveHereBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith(null);
  });

  it('confirms move to subfolder when inside subfolder', async () => {
    const user = userEvent.setup();
    renderComponent({ sourceFolderId: null });

    const openButton = await screen.findByRole('button', { name: 'Open Financials' });
    await user.click(openButton);
    await screen.findByText('Q1 Reports');

    const moveHereBtn = screen.getByRole('button', { name: 'Move Here' });
    expect(moveHereBtn).not.toBeDisabled();
    await user.click(moveHereBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith('folder_root_1');
  });

  it('displays "No subfolders" when a folder has no subfolders', async () => {
    api.getDataroomFolderContents.mockResolvedValue({ data: mockEmptySubFolderContent });
    const user = userEvent.setup();
    renderComponent();

    const openButton = await screen.findByRole('button', { name: 'Open Financials' });
    await user.click(openButton);

    expect(await screen.findByText('No subfolders')).toBeInTheDocument();
  });

  it('creates a new folder inline via AddFolderDialog and selects it', async () => {
    api.createDataroomFolder.mockResolvedValue({
      data: { id: 'new_folder_1', name: 'New Strategy Folder' },
    });
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('Financials');

    // Click "+ New Folder"
    const newFolderBtn = screen.getByRole('button', { name: /new folder/i });
    await user.click(newFolderBtn);

    // AddFolderDialog should open
    const addFolderDialog = await screen.findByRole('dialog', { name: /create new folder/i });
    const input = within(addFolderDialog).getByLabelText(/folder name/i);
    await user.type(input, 'New Strategy Folder');

    const createBtn = within(addFolderDialog).getByRole('button', { name: 'New Folder' });
    await user.click(createBtn);

    await waitFor(() => {
      expect(api.createDataroomFolder).toHaveBeenCalledWith({
        name: 'New Strategy Folder',
        dataroom: 'dr_123',
        parent: null,
      });
    });
  });

  it('ignores stale responses when navigating rapidly between folders', async () => {
    let resolveFirstRequest;
    const firstRequestPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve;
    });

    // Slow folder navigation request
    api.getDataroomFolderContents.mockReturnValue(firstRequestPromise);

    const user = userEvent.setup();
    renderComponent({ sourceFolderId: 'folder_root_1' });

    // 1. Initial load shows root folders
    expect(await screen.findByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();

    // 2. User clicks open Financials (triggers slow request 1)
    const openFinancialsButton = screen.getByRole('button', { name: 'Open Financials' });
    await user.click(openFinancialsButton);

    // 3. User clicks Home in breadcrumb before request 1 completes (triggers faster request 2)
    // Fast response from root
    api.getDataroom.mockResolvedValue({ data: mockDataroomRoot });

    // In breadcrumbs, Root button is Home
    const rootBreadcrumb = await screen.findByRole('button', { name: 'Home' });
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

  it('displays error state and retries fetching folder contents when Retry is clicked', async () => {
    api.getDataroom.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    renderComponent();

    // Error message and retry button should be visible
    expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeInTheDocument();

    // Clicking Retry re-calls getDataroom and renders folders
    await user.click(retryBtn);
    expect(await screen.findByText('Financials')).toBeInTheDocument();
    expect(screen.queryByText('An unexpected error occurred.')).not.toBeInTheDocument();
  });

  it('toggles aria-pressed attribute correctly when selecting destinations', async () => {
    const user = userEvent.setup();
    renderComponent({ sourceFolderId: 'folder_root_1' });

    await screen.findByText('Financials');

    const homeBtn = screen.getByText('Home Directory').closest('button');
    const financialsText = screen.getByText('Financials');
    const financialsBtn = financialsText.closest('button');

    // Initially Home Directory is selected
    expect(homeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(financialsBtn).toHaveAttribute('aria-pressed', 'false');

    // Selecting Financials updates aria-pressed
    await user.click(financialsText);
    expect(homeBtn).toHaveAttribute('aria-pressed', 'false');
    expect(financialsBtn).toHaveAttribute('aria-pressed', 'true');

    // Selecting Home Directory restores aria-pressed
    await user.click(homeBtn);
    expect(homeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(financialsBtn).toHaveAttribute('aria-pressed', 'false');
  });
});


