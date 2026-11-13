import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddContentDialog } from '../../../components/dialogs/AddContentDialog';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  getRootFolderContents: vi.fn(),
  getFolderContents: vi.fn(),
}));

const mockRootContent = {
  current_folder: null,
  sub_folders: [
    { id: 'folder_1', name: 'spreadsheets', items_count: 8, updated_at: '2026-10-21T10:00:00Z' },
    { id: 'folder_2', name: 'videos', items_count: 4, updated_at: '2026-09-22T10:00:00Z' },
  ],
  documents: [
    { id: 'doc_1', name: 'Q3 Report.pdf', type: 'pdf', file_size: 2400000, updated_at: '2026-10-20T10:00:00Z' },
    { id: 'doc_2', name: 'hero.png', type: 'image', file_size: 1800000, updated_at: '2026-10-19T10:00:00Z' },
  ],
};

const mockSubFolderContent = {
  current_folder: {
    id: 'folder_1',
    name: 'spreadsheets',
    ancestors: [],
  },
  sub_folders: [
    { id: 'folder_sub_1', name: 'Financial Models', items_count: 3, updated_at: '2026-10-21T11:00:00Z' },
  ],
  documents: [
    { id: 'doc_sub_1', name: 'Budget 2026.xlsx', type: 'spreadsheet', file_size: 512000, updated_at: '2026-10-21T12:00:00Z' },
  ],
};

describe('AddContentDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    api.getRootFolderContents.mockResolvedValue({ data: mockRootContent });
    api.getFolderContents.mockResolvedValue({ data: mockSubFolderContent });
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onOpenChange: mockOnOpenChange,
      onConfirm: mockOnConfirm,
    };
    return render(<AddContentDialog {...defaultProps} {...props} />);
  };

  it('renders dialog with search filter, breadcrumbs, and root items', async () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: 'Add Content to Dataroom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filter current list...')).toBeInTheDocument();

    // Verify folder and document entries render
    expect(await screen.findByText('spreadsheets')).toBeInTheDocument();
    expect(screen.getByText('8 items')).toBeInTheDocument();
    expect(screen.getByText('videos')).toBeInTheDocument();
    expect(screen.getByText('Q3 Report.pdf')).toBeInTheDocument();
    expect(screen.getByText('hero.png')).toBeInTheDocument();

    // Submit button should be disabled initially
    const submitBtn = screen.getByRole('button', { name: /add.*item/i });
    expect(submitBtn).toBeDisabled();
  });

  it('allows multi-selecting items and updates selected counter and CTA button', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    // Select spreadsheets folder
    const folderCheckbox = screen.getByRole('checkbox', { name: 'spreadsheets' });
    await user.click(folderCheckbox);

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 1 item' })).not.toBeDisabled();

    // Select Q3 Report.pdf document
    const docCheckbox = screen.getByRole('checkbox', { name: 'Q3 Report.pdf' });
    await user.click(docCheckbox);

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: 'Add 2 items' });
    expect(submitBtn).not.toBeDisabled();

    // Clicking Clear Selection unchecks all items
    const clearBtn = screen.getByRole('button', { name: 'Clear Selection' });
    await user.click(clearBtn);

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(folderCheckbox).not.toBeChecked();
    expect(docCheckbox).not.toBeChecked();
  });

  it('filters current list in real-time using search input', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    const searchInput = screen.getByPlaceholderText('Filter current list...');
    await user.type(searchInput, '  report  ');

    // Only Q3 Report.pdf matches even with surrounding whitespace
    expect(screen.getByText('Q3 Report.pdf')).toBeInTheDocument();
    expect(screen.queryByText('spreadsheets')).not.toBeInTheDocument();
    expect(screen.queryByText('videos')).not.toBeInTheDocument();
    expect(screen.queryByText('hero.png')).not.toBeInTheDocument();

    // Type query with no matches
    await user.clear(searchInput);
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No files or folders match your filter.')).toBeInTheDocument();

    // Clearing input restores list
    await user.clear(searchInput);
    expect(screen.getByText('spreadsheets')).toBeInTheDocument();
    expect(screen.getByText('hero.png')).toBeInTheDocument();
  });

  it('navigates into subfolder via open chevron button and returns via breadcrumbs', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    // Open spreadsheets subfolder
    const openBtn = screen.getByRole('button', { name: 'Open spreadsheets' });
    await user.click(openBtn);

    await waitFor(() => {
      expect(api.getFolderContents).toHaveBeenCalledWith('folder_1');
    });

    // Subfolder contents are displayed
    expect(await screen.findByText('Financial Models')).toBeInTheDocument();
    expect(screen.getByText('Budget 2026.xlsx')).toBeInTheDocument();

    // Breadcrumb shows Home button and current folder as active page
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('spreadsheets', { selector: '[aria-current="page"]' })).toBeInTheDocument();

    // Click Home to return to root
    const homeBtn = screen.getByRole('button', { name: 'Home' });
    await user.click(homeBtn);

    await waitFor(() => {
      expect(api.getRootFolderContents).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('videos')).toBeInTheDocument();
  });

  it('navigates into subfolder on double click', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    const folderRow = screen.getByText('spreadsheets').closest('.group');
    await user.dblClick(folderRow);

    await waitFor(() => {
      expect(api.getFolderContents).toHaveBeenCalledWith('folder_1');
    });
    expect(await screen.findByText('Financial Models')).toBeInTheDocument();
  });

  it('submits selected document and folder IDs when confirmed', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    await user.click(screen.getByRole('checkbox', { name: 'spreadsheets' }));
    await user.click(screen.getByRole('checkbox', { name: 'hero.png' }));

    const submitBtn = screen.getByRole('button', { name: 'Add 2 items' });
    await user.click(submitBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith({
      document_ids: ['doc_2'],
      folder_ids: ['folder_1'],
    });
  });

  it('displays error state and recovers on Retry button click', async () => {
    api.getRootFolderContents.mockRejectedValueOnce(new Error('Fetch failure'));
    const user = userEvent.setup();
    renderComponent();

    expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeInTheDocument();

    // Clicking Retry fetches contents again and restores list
    await user.click(retryBtn);
    expect(await screen.findByText('spreadsheets')).toBeInTheDocument();
    expect(screen.queryByText('An unexpected error occurred.')).not.toBeInTheDocument();
  });

  it('retries the specific subfolder that failed to load', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    // Make subfolder fetch fail once
    api.getFolderContents.mockRejectedValueOnce(new Error('Subfolder load failure'));

    const openBtn = screen.getByRole('button', { name: 'Open spreadsheets' });
    await user.click(openBtn);

    expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();

    // Clicking Retry should retry folder_1 (the failed destination), not root
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(api.getFolderContents).toHaveBeenCalledWith('folder_1');
    });

    expect(await screen.findByText('Financial Models')).toBeInTheDocument();
    expect(screen.queryByText('An unexpected error occurred.')).not.toBeInTheDocument();
  });

  it('ignores stale responses when navigating rapidly', async () => {
    let resolveSlowRequest;
    const slowPromise = new Promise((resolve) => {
      resolveSlowRequest = resolve;
    });
    api.getFolderContents.mockReturnValue(slowPromise);

    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    // Trigger slow request
    const openBtn = screen.getByRole('button', { name: 'Open spreadsheets' });
    await user.click(openBtn);

    // Rapidly navigate back to Home before slow request resolves
    api.getRootFolderContents.mockResolvedValue({ data: mockRootContent });
    const homeBtn = await screen.findByRole('button', { name: 'Home' });
    await user.click(homeBtn);

    expect(await screen.findByText('videos')).toBeInTheDocument();

    // Slow response completes late
    resolveSlowRequest({ data: mockSubFolderContent });
    await new Promise((r) => setTimeout(r, 50));

    // Stale subfolder response does not overwrite root
    expect(screen.getByText('videos')).toBeInTheDocument();
    expect(screen.queryByText('Financial Models')).not.toBeInTheDocument();
  });

  it('clears selection when navigating into a selected folder or returning via breadcrumbs', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    // Select the 'spreadsheets' folder and a root document
    await user.click(screen.getByRole('checkbox', { name: 'spreadsheets' }));
    await user.click(screen.getByRole('checkbox', { name: 'Q3 Report.pdf' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    // Navigate into 'spreadsheets' via chevron button
    await user.click(screen.getByRole('button', { name: 'Open spreadsheets' }));
    expect(await screen.findByText('Budget 2026.xlsx')).toBeInTheDocument();

    // Previous selection must be cleared
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*item/i })).toBeDisabled();

    // Select a document inside the subfolder and confirm only that document is submitted
    await user.click(screen.getByRole('checkbox', { name: 'Budget 2026.xlsx' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add 1 item' }));
    expect(mockOnConfirm).toHaveBeenCalledWith({
      document_ids: ['doc_sub_1'],
      folder_ids: [],
    });

    // Navigating back to Home via breadcrumb also clears current selection
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(await screen.findByText('videos')).toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*item/i })).toBeDisabled();
  });

  it('clears selection when entering an already-selected folder via double click', async () => {
    const user = userEvent.setup();
    renderComponent();

    await screen.findByText('spreadsheets');

    await user.click(screen.getByRole('checkbox', { name: 'spreadsheets' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    const folderRow = screen.getByText('spreadsheets').closest('.group');
    await user.dblClick(folderRow);

    expect(await screen.findByText('Budget 2026.xlsx')).toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add.*item/i })).toBeDisabled();
  });
});
