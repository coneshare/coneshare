import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferOwnershipDialog } from '../../../components/datarooms/TransferOwnershipDialog';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  getEligibleCollaborators: vi.fn(),
  transferDataroomOwnership: vi.fn(),
}));

describe('TransferOwnershipDialog', () => {
  const mockDataroom = {
    id: 'dr_123',
    name: 'Project Moonshot',
    created_by: 'u1',
  };

  const mockUsers = [
    { id: 'u2', name: 'Bob Partner', email: 'bob@example.com' },
    { id: 'u3', name: 'Charlie Colleague', email: 'charlie@example.com' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.getEligibleCollaborators.mockResolvedValue({ data: mockUsers });
    api.transferDataroomOwnership.mockResolvedValue({});
  });

  it('renders eligible users list and allows selecting a new owner', async () => {
    const user = userEvent.setup();
    const mockOpenChange = vi.fn();
    const mockSuccess = vi.fn();

    render(
      <TransferOwnershipDialog
        isOpen={true}
        onOpenChange={mockOpenChange}
        dataroom={mockDataroom}
        onSuccess={mockSuccess}
      />
    );

    expect(screen.getByRole('heading', { name: /Transfer Dataroom Ownership/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Bob Partner')).toBeInTheDocument();
      expect(screen.getByText('Charlie Colleague')).toBeInTheDocument();
    });

    // Select Bob
    await user.click(screen.getByText('Bob Partner'));

    // Warning confirmation note appears
    expect(screen.getByText(/Transferring ownership will make Bob Partner the primary owner/i)).toBeInTheDocument();

    // Confirm button is enabled and clicked
    const confirmBtn = screen.getByRole('button', { name: 'Transfer Ownership' });
    expect(confirmBtn).not.toBeDisabled();
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.transferDataroomOwnership).toHaveBeenCalledWith('dr_123', 'u2');
      expect(mockOpenChange).toHaveBeenCalledWith(false);
      expect(mockSuccess).toHaveBeenCalled();
    });
  });

  it('supports searching eligible users by query', async () => {
    const user = userEvent.setup();

    render(
      <TransferOwnershipDialog
        isOpen={true}
        onOpenChange={vi.fn()}
        dataroom={mockDataroom}
        onSuccess={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search team members/i);
    await user.type(searchInput, 'charlie');

    await waitFor(() => {
      expect(api.getEligibleCollaborators).toHaveBeenCalledWith('dr_123', 'charlie');
    });
  });
});
