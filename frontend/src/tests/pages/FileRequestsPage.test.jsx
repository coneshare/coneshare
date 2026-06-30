import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { FileRequestsPage } from '../../pages/FileRequestsPage';
import { BreadcrumbProvider } from '../../components/layout/BreadcrumbProvider';
import * as api from '../../services/api';

vi.mock('../../services/api', () => ({
  getFileRequests: vi.fn(),
  deleteFileRequest: vi.fn(),
  updateFileRequest: vi.fn(),
  getFolderContents: vi.fn().mockResolvedValue({ data: { current_folder: null, sub_folders: [], documents: [] } }),
  getRootFolderContents: vi.fn().mockResolvedValue({ data: { current_folder: null, sub_folders: [], documents: [] } }),
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const mockFileRequests = [
  {
    id: 'fr-1',
    name: 'Request A',
    slug: 'request-a',
    folder: 'folder-1',
    folder_name: 'Folder A',
    uploaded_files_count: 5,
    is_active: true,
    created_at: '2026-05-28T14:30:00Z',
    expires_at: null,
  },
];

describe('FileRequestsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getFileRequests.mockResolvedValue({
      data: {
        results: mockFileRequests,
        count: 1,
      },
    });
    api.getFolderContents.mockResolvedValue({ data: { current_folder: null, sub_folders: [] } });
    api.getRootFolderContents.mockResolvedValue({ data: { current_folder: null, sub_folders: [] } });
  });

  it('renders the file requests and closes the action menu when items are clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BreadcrumbProvider>
          <FileRequestsPage />
        </BreadcrumbProvider>
      </MemoryRouter>
    );

    // Wait for the list to load and check if item is displayed
    expect(await screen.findByText('Request A')).toBeInTheDocument();

    // Click three dot button to open menu
    const actionButton = screen.getByRole('button', { name: 'Actions for Request A' });
    await user.click(actionButton);

    // Verify dropdown menu options are present
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    expect(editItem).toBeInTheDocument();

    // Click Edit menu item
    await user.click(editItem);

    // Verify dropdown menu closes on select
    expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument();
  });
});
