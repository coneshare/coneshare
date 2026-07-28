import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../../services/api';
import TrashPage from '../../pages/TrashPage';

vi.mock('../../services/api');

vi.mock('../../contexts/UserProvider', () => ({
  useUser: () => ({
    refreshUser: vi.fn(),
  }),
}));

describe('TrashPage Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders empty trash state when no deleted items exist', async () => {
    api.getTrashItems.mockResolvedValue({ data: { results: [] } });

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
      expect(screen.getByText('Items you delete will appear here.')).toBeInTheDocument();
    });
  });

  it('renders trash items when returned from API', async () => {
    const mockItems = [
      {
        id: '1',
        name: 'Deleted Doc.pdf',
        item_type: 'document',
        file_type: 'pdf',
        size: 1024,
        deleted_at: new Date().toISOString(),
        parent_name: '__root__',
        parent_id: 'root',
        view_count: 5,
      },
    ];
    api.getTrashItems.mockResolvedValue({ data: { results: mockItems } });

    render(
      <MemoryRouter>
        <TrashPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Deleted Doc.pdf')).toBeInTheDocument();
      expect(screen.getByText('Root')).toBeInTheDocument();
    });
  });
});
