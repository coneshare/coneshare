import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProvider, useUser } from '../../contexts/UserProvider';
import * as api from '../../services/api';
import { jwtDecode } from 'jwt-decode';

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  getUser: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  authService: {
    logout: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

function TestConsumer() {
  const { user } = useUser();
  return (
    <div>
      <span data-testid="user-name">{user ? user.name : 'No User'}</span>
      <span data-testid="user-id">{user ? user.id : 'No ID'}</span>
    </div>
  );
}

describe('UserProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('fetches user when only access_token is present in localStorage', async () => {
    localStorage.setItem('access_token', 'mock_access_token');
    jwtDecode.mockReturnValue({ user_id: 101 });
    api.getUser.mockResolvedValue({ data: { id: 101, name: 'Alice' } });

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    await waitFor(() => {
      expect(api.getUser).toHaveBeenCalledWith(101);
      expect(screen.getByTestId('user-name')).toHaveTextContent('Alice');
    });
  });

  it('fetches user when only refresh_token is present in localStorage', async () => {
    localStorage.setItem('refresh_token', 'mock_refresh_token');
    jwtDecode.mockReturnValue({ user_id: 202 });
    api.getUser.mockResolvedValue({ data: { id: 202, name: 'Bob' } });

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    await waitFor(() => {
      expect(jwtDecode).toHaveBeenCalledWith('mock_refresh_token');
      expect(api.getUser).toHaveBeenCalledWith(202);
      expect(screen.getByTestId('user-name')).toHaveTextContent('Bob');
    });
  });

  it('does not attempt to fetch user when neither token is present', async () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>
    );

    expect(screen.getByTestId('user-name')).toHaveTextContent('No User');
    expect(api.getUser).not.toHaveBeenCalled();
    expect(jwtDecode).not.toHaveBeenCalled();
  });
});
