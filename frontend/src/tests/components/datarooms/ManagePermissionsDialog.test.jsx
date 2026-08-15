import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagePermissionsDialog } from '../../../components/datarooms/ManagePermissionsDialog';
import * as api from '../../../services/api';
import '../../../i18n';

// Mocks
vi.mock('../../../services/api');
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

describe('ManagePermissionsDialog', () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();

  const mockDataroomContent = {
    folders: [
      { id: 'f1', name: 'Folder A', parent: null },
      { id: 'f2', name: 'Folder B (empty)', parent: null },
      { id: 'f3', name: 'Subfolder C', parent: 'f1' },
    ],
    documents: [
      { id: 'ddoc1', document_name: 'Doc 1', folder: 'f1' },
      { id: 'ddoc2', document_name: 'Doc 2', folder: 'f3' },
      { id: 'ddoc3', document_name: 'Root Doc 3', folder: null },
    ],
  };

  const mockLink = {
    id: 'link_123',
    dataroom: 'dr_abc',
    name: 'Test Link',
    dataroom_settings: [
      { id: 's_f1', dataroom_folder: 'f1', is_visible: true, allow_download: true, enable_watermark: false },
      { id: 's_f2', dataroom_folder: 'f2', is_visible: true, allow_download: false, enable_watermark: false },
      { id: 's_f3', dataroom_folder: 'f3', is_visible: true, allow_download: true, enable_watermark: false },
      { id: 's_ddoc1', dataroom_document: 'ddoc1', is_visible: true, allow_download: true, enable_watermark: false },
      { id: 's_ddoc2', dataroom_document: 'ddoc2', is_visible: true, allow_download: true, enable_watermark: false },
      { id: 's_ddoc3', dataroom_document: 'ddoc3', is_visible: true, allow_download: true, enable_watermark: true },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.getDataroom.mockResolvedValue({ data: mockDataroomContent });
    api.updateDataroomLinkSettings.mockResolvedValue({});
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onOpenChange: mockOnOpenChange,
      link: mockLink,
      onSuccess: mockOnSuccess,
    };
    return render(<ManagePermissionsDialog {...defaultProps} {...props} />);
  };

  // Helper to get checkboxes for a specific item row
  const getCheckboxesForRow = (name) => {
    const row = screen.getByText(name).closest('div.grid');
    return within(row).getAllByRole('checkbox');
  };

  it('renders the component and displays the content tree', async () => {
    renderComponent();
    expect(api.getDataroom).toHaveBeenCalledWith('dr_abc', { content: 'full' });
    expect(await screen.findByText('Folder A')).toBeInTheDocument();
    expect(screen.getByText('Doc 1')).toBeInTheDocument();
    expect(screen.getByText('Subfolder C')).toBeInTheDocument();
    expect(screen.getByText('Doc 2')).toBeInTheDocument();
    expect(screen.getByText('Root Doc 3')).toBeInTheDocument();
  });

  it('initializes document checkboxes with correct settings', async () => {
    renderComponent();
    await screen.findByText('Doc 1');

    // Doc 1: visible: true, download: true, watermark: false
    const doc1Checkboxes = getCheckboxesForRow('Doc 1');
    expect(doc1Checkboxes[0]).toBeChecked();
    expect(doc1Checkboxes[1]).toBeChecked();
    expect(doc1Checkboxes[2]).not.toBeChecked();

    // Root Doc 3: visible: true, download: true, watermark: true
    const doc3Checkboxes = getCheckboxesForRow('Root Doc 3');
    expect(doc3Checkboxes[0]).toBeChecked();
    expect(doc3Checkboxes[1]).toBeChecked();
    expect(doc3Checkboxes[2]).toBeChecked();
  });

  it('updates a single document permission and saves', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Doc 1');

    const doc1Checkboxes = getCheckboxesForRow('Doc 1');
    await user.click(doc1Checkboxes[1]); // Uncheck "Download"

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(api.updateDataroomLinkSettings).toHaveBeenCalledWith('link_123', [
        {
          id: 's_ddoc1',
          is_visible: true,
          allow_download: false,
          enable_watermark: false,
        },
      ]);
    });
    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('applies bulk settings to a folder and all its descendants', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Folder A');

    const folderACheckboxes = getCheckboxesForRow('Folder A');
    await user.click(folderACheckboxes[0]); // Bulk uncheck "Visible"

    // Check that direct and nested children are affected
    const doc1Checkboxes = getCheckboxesForRow('Doc 1'); // direct child doc
    const subfolderCCheckboxes = getCheckboxesForRow('Subfolder C'); // direct child folder
    const doc2Checkboxes = getCheckboxesForRow('Doc 2'); // nested child doc
    
    expect(doc1Checkboxes[0]).not.toBeChecked();
    expect(subfolderCCheckboxes[0]).not.toBeChecked();
    expect(doc2Checkboxes[0]).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(api.updateDataroomLinkSettings).toHaveBeenCalledWith(
        'link_123',
        expect.arrayContaining([
          expect.objectContaining({ id: 's_f1', is_visible: false }), // Folder A
          expect.objectContaining({ id: 's_ddoc1', is_visible: false }), // Doc 1
          expect.objectContaining({ id: 's_f3', is_visible: false }), // Subfolder C
          expect.objectContaining({ id: 's_ddoc2', is_visible: false }), // Doc 2
        ])
      );
    });
  });

  it('applies bulk settings recursively to nested items', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Folder A');

    // Folder A > Subfolder C > Doc 2
    // Uncheck "Download" for Folder A
    const folderACheckboxes = getCheckboxesForRow('Folder A');
    await user.click(folderACheckboxes[1]);

    // Check that nested items are affected
    const doc1Checkboxes = getCheckboxesForRow('Doc 1');
    const doc2Checkboxes = getCheckboxesForRow('Doc 2');

    expect(doc1Checkboxes[1]).not.toBeChecked();
    expect(doc2Checkboxes[1]).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(api.updateDataroomLinkSettings).toHaveBeenCalledWith(
        'link_123',
        expect.arrayContaining([
          expect.objectContaining({ id: 's_f1', allow_download: false }),
          // Check that recursive children were updated
          expect.objectContaining({ id: 's_f3', allow_download: false }),
          expect.objectContaining({ id: 's_ddoc1', allow_download: false }),
          expect.objectContaining({ id: 's_ddoc2', allow_download: false }),
        ])
      );
    });
  });

  it('does not call API if no changes are made', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Folder A');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(api.updateDataroomLinkSettings).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not save changes when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Doc 1');

    const doc1Checkboxes = getCheckboxesForRow('Doc 1');
    await user.click(doc1Checkboxes[0]); // Uncheck "Visible"

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.updateDataroomLinkSettings).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should display correctly when dataroom is empty', async () => {
    api.getDataroom.mockResolvedValue({ data: { folders: [], documents: [] } });
    renderComponent();
    await waitFor(() => expect(api.getDataroom).toHaveBeenCalledWith('dr_abc', { content: 'full' }));

    // Check that no content items are rendered
    expect(screen.queryByText('Folder A')).not.toBeInTheDocument();
    expect(screen.queryByText('Root Doc 3')).not.toBeInTheDocument();

    // Assert that the empty state notice is displayed
    expect(screen.getByText('This dataroom is empty')).toBeInTheDocument();
  });

  it('should handle bulk changes with individual overrides', async () => {
    const user = userEvent.setup();
    renderComponent();
    await screen.findByText('Folder A');

    // Initial state of Doc 1 (in Folder A): download is TRUE
    const doc1CheckboxesInitial = getCheckboxesForRow('Doc 1');
    expect(doc1CheckboxesInitial[1]).toBeChecked();

    // 1. Bulk action: Uncheck "Download" for Folder A
    const folderACheckboxes = getCheckboxesForRow('Folder A');
    await user.click(folderACheckboxes[1]);

    // Verify Doc 1's download checkbox is now unchecked due to bulk action
    const doc1CheckboxesAfterBulk = getCheckboxesForRow('Doc 1');
    expect(doc1CheckboxesAfterBulk[1]).not.toBeChecked();

    // 2. Override: Manually re-check "Download" for Doc 1
    await user.click(doc1CheckboxesAfterBulk[1]);
    expect(doc1CheckboxesAfterBulk[1]).toBeChecked();

    // 3. Save changes
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    // 4. Assert payload
    await waitFor(() => {
      const [linkId, payload] = api.updateDataroomLinkSettings.mock.calls[0];

      expect(linkId).toBe('link_123');
      // Only items with a net change should be in the payload.
      expect(payload).toHaveLength(3);
      expect(payload).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 's_f1', allow_download: false }),
        expect.objectContaining({ id: 's_f3', allow_download: false }),
        expect.objectContaining({ id: 's_ddoc2', allow_download: false }),
      ]));
    });    

  });

  it('should refetch data and reset state when reopened', async () => {
    const { rerender } = renderComponent();

    await waitFor(() => {
      expect(api.getDataroom).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Folder A')).toBeInTheDocument();

    // Close the dialog
    rerender(<ManagePermissionsDialog isOpen={false} onOpenChange={mockOnOpenChange} link={mockLink} onSuccess={mockOnSuccess} />);

    // Mock new data for the second fetch
    const newMockDataroomContent = {
      folders: [{ id: 'f_new', name: 'New Folder', parent: null }],
      documents: [{ id: 'ddoc_new', document_name: 'New Doc', folder: null }],
    };
    const newMockLink = {
      ...mockLink,
      dataroom_settings: [
        { id: 's_f_new', dataroom_folder: 'f_new', is_visible: true, allow_download: false, enable_watermark: false },
        { id: 's_ddoc_new', dataroom_document: 'ddoc_new', is_visible: true, allow_download: true, enable_watermark: false },
      ]
    };
    api.getDataroom.mockResolvedValue({ data: newMockDataroomContent });

    // Reopen the dialog
    rerender(<ManagePermissionsDialog isOpen={true} onOpenChange={mockOnOpenChange} link={newMockLink} onSuccess={mockOnSuccess} />);

    await waitFor(() => {
      expect(api.getDataroom).toHaveBeenCalledTimes(2);
    });

    // Assert new content is shown and old content is gone
    expect(await screen.findByText('New Folder')).toBeInTheDocument();
    expect(screen.queryByText('Folder A')).not.toBeInTheDocument();
  });
});
