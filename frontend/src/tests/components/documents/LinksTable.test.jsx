import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LinksTable } from '../../../components/documents/LinksTable';
import { toast } from 'sonner';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const renderWithRouter = (ui) => {
  return render(ui, { wrapper: MemoryRouter });
};

describe('LinksTable CopyableLink Fallback', () => {
  const mockLinks = [
    {
      id: 'link_123',
      slug: 'test-slug-123',
      name: 'Test Link',
      view_count: 0,
      created_at: new Date().toISOString(),
      last_viewed_at: null,
      is_active: true,
      expires_at: null,
      recent_view_sessions: [],
    },
  ];

  let execCommandSpy;
  let originalExecCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.clipboard to be undefined to force fallback
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });

    // JSDOM doesn't implement execCommand, so we mock it.
    originalExecCommand = document.execCommand;
    execCommandSpy = vi.fn();
    document.execCommand = execCommandSpy;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.execCommand = originalExecCommand;
  });

  it('should successfully copy link in insecure context', async () => {
    // Mock execCommand to simulate success.
    execCommandSpy.mockReturnValue(true);

    renderWithRouter(
      <LinksTable
        links={mockLinks}
        onEditLink={vi.fn()}
        onDeleteLink={vi.fn()}
        onLinkUpdate={vi.fn()}
        onManagePermissions={vi.fn()}
      />
    );

    const copyableDiv = screen.getByTestId(`copyable-link-div-${mockLinks[0].slug}`);

    // Use fireEvent.click to ensure a simple click event is dispatched
    // directly to the element with the onClick handler.
    fireEvent.click(copyableDiv);

    // Assert that the fallback was attempted and succeeded
    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard!');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
