import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddDataroomDialog } from '../../../components/datarooms/AddDataroomDialog';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  createDataroom: vi.fn(),
}));

describe('AddDataroomDialog', () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and disables submit button when name is empty', async () => {
    render(
      <AddDataroomDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Add New Dataroom')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Project Alpha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Dataroom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('enables submit button only with non-whitespace name', async () => {
    const user = userEvent.setup();
    render(
      <AddDataroomDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByPlaceholderText('e.g., Project Alpha');
    const submitBtn = screen.getByRole('button', { name: 'Create Dataroom' });

    await user.type(input, '   ');
    expect(submitBtn).toBeDisabled();

    await user.type(input, 'Project Titan');
    expect(submitBtn).toBeEnabled();
  });

  it('disables buttons and prevents duplicate submissions while creating', async () => {
    let resolvePromise;
    api.createDataroom.mockReturnValue(new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    const user = userEvent.setup();
    render(
      <AddDataroomDialog
        isOpen={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByPlaceholderText('e.g., Project Alpha');
    await user.type(input, 'Project Titan');

    const submitBtn = screen.getByRole('button', { name: 'Create Dataroom' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });

    // First click
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });

    const creatingBtn = screen.getByRole('button', { name: /creating/i });
    expect(creatingBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    expect(input).toBeDisabled();

    // Second click
    fireEvent.click(creatingBtn);
    expect(api.createDataroom).toHaveBeenCalledTimes(1);
    expect(api.createDataroom).toHaveBeenCalledWith({ name: 'Project Titan' });

    // Complete creation
    resolvePromise({ data: { id: 'dr_123' } });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
