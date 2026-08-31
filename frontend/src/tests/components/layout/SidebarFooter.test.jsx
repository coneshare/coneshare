import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SidebarFooter from '../../../components/layout/SidebarFooter';
import * as UserProviderModule from '../../../contexts/UserProvider';
import * as SidebarProviderModule from '../../../components/layout/SidebarProvider';
import '../../../i18n';

describe('SidebarFooter & NavUser Skeleton Loading', () => {
  it('renders skeleton placeholders when user is not loaded', () => {
    vi.spyOn(UserProviderModule, 'useUser').mockReturnValue({
      user: null,
      handleLogout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(SidebarProviderModule, 'useSidebar').mockReturnValue({
      isCollapsed: false,
    });

    const { container } = render(
      <MemoryRouter>
        <SidebarFooter />
      </MemoryRouter>
    );

    // Skeletons should be rendered (with animate-pulse class)
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders user details and quota when user is loaded', () => {
    vi.spyOn(UserProviderModule, 'useUser').mockReturnValue({
      user: {
        id: 'u1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        file_size_quota_mb: 1000,
        total_document_size: 104857600, // 100 MB
      },
      handleLogout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(SidebarProviderModule, 'useSidebar').mockReturnValue({
      isCollapsed: false,
    });

    render(
      <MemoryRouter>
        <SidebarFooter />
      </MemoryRouter>
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText(/100 MB/)).toBeInTheDocument();
  });
});
