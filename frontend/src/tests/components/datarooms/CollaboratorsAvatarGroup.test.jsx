import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CollaboratorsAvatarGroup } from '../../../components/datarooms/CollaboratorsAvatarGroup';
import * as api from '../../../services/api';
import '../../../i18n';

vi.mock('../../../services/api', () => ({
  getDataroomCollaborators: vi.fn(),
  getEligibleCollaborators: vi.fn(),
  addDataroomCollaborators: vi.fn(),
  removeDataroomCollaborator: vi.fn(),
  transferDataroomOwnership: vi.fn(),
}));

vi.mock('../../../contexts/UserProvider', () => ({
  useUser: () => ({
    user: { id: 'u1', name: 'Alice Owner', email: 'alice@example.com', role: 'member' },
  }),
}));

describe('CollaboratorsAvatarGroup', () => {
  const mockDataroom = {
    id: 'dr_123',
    name: 'M&A Deal Room',
    owner: { id: 'u1', name: 'Alice Owner', email: 'alice@example.com' },
    collaborators: [
      {
        id: 'collab_1',
        user: { id: 'u2', name: 'Bob Collab', email: 'bob@example.com' },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.getDataroomCollaborators.mockResolvedValue({
      data: {
        owner: mockDataroom.owner,
        collaborators: mockDataroom.collaborators,
      },
    });
    api.getEligibleCollaborators.mockResolvedValue({ data: [] });
  });

  it('renders owner and collaborator avatars and collaborator button', () => {
    render(
      <MemoryRouter>
        <CollaboratorsAvatarGroup dataroom={mockDataroom} />
      </MemoryRouter>
    );

    expect(screen.getByText('AO')).toBeInTheDocument(); // Alice Owner initials
    expect(screen.getByText('BC')).toBeInTheDocument(); // Bob Collab initials
    expect(screen.getByRole('button', { name: /collaborators/i })).toBeInTheDocument();
  });

  it('opens manage collaborators dialog when clicking avatar stack or button', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CollaboratorsAvatarGroup dataroom={mockDataroom} />
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /collaborators/i });
    await user.click(button);

    expect(screen.getByRole('heading', { name: /Manage Collaborators/i })).toBeInTheDocument();
  });

  it('renders overflow counter with localized tooltip when more than max visible members exist', () => {
    const dataroomWithManyMembers = {
      ...mockDataroom,
      collaborators: [
        { id: 'c1', user: { id: 'u2', name: 'User Two' } },
        { id: 'c2', user: { id: 'u3', name: 'User Three' } },
        { id: 'c3', user: { id: 'u4', name: 'User Four' } },
        { id: 'c4', user: { id: 'u5', name: 'User Five' } },
        { id: 'c5', user: { id: 'u6', name: 'User Six' } },
      ],
    };

    render(
      <MemoryRouter>
        <CollaboratorsAvatarGroup dataroom={dataroomWithManyMembers} />
      </MemoryRouter>
    );

    // 1 owner + 5 collaborators = 6 members, 4 visible, 2 remaining
    const overflowBadge = screen.getByText('+2');
    expect(overflowBadge).toBeInTheDocument();
    expect(overflowBadge).toHaveAttribute('title', '2 more members');
  });
});
