import { render, screen, fireEvent } from '@testing-library/react';
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

describe('LinksTable Q&A Column (Dashboard Widget)', () => {
  it('does not display Q&A column when isDashboardWidget is false', () => {
    const links = [
      {
        id: 'link_1',
        slug: 'slug-1',
        name: 'Regular Link',
        view_count: 3,
        created_at: new Date().toISOString(),
        qna_enabled: true,
        qna_total_threads: 2,
        qna_unresolved_threads: 1,
      },
    ];

    renderWithRouter(<LinksTable links={links} isDashboardWidget={false} />);
    expect(screen.queryByRole('columnheader', { name: /q&a/i })).not.toBeInTheDocument();
  });

  it('displays Q&A column and states when isDashboardWidget is true', () => {
    const links = [
      {
        id: 'link_open',
        slug: 'slug-open',
        name: 'Open Q&A Dataroom Link',
        dataroom: 'dr-100',
        dataroom_name: 'Investor Room',
        view_count: 5,
        created_at: new Date().toISOString(),
        qna_enabled: true,
        qna_total_threads: 5,
        qna_unresolved_threads: 2,
      },
      {
        id: 'link_resolved',
        slug: 'slug-resolved',
        name: 'Resolved Q&A Doc Link',
        document: 'doc-200',
        document_name: 'Pitch Deck.pdf',
        view_count: 2,
        created_at: new Date().toISOString(),
        qna_enabled: true,
        qna_total_threads: 4,
        qna_unresolved_threads: 0,
      },
      {
        id: 'link_zero',
        slug: 'slug-zero',
        name: 'Zero Questions Link',
        document: 'doc-300',
        view_count: 1,
        created_at: new Date().toISOString(),
        qna_enabled: true,
        qna_total_threads: 0,
        qna_unresolved_threads: 0,
      },
      {
        id: 'link_disabled',
        slug: 'slug-disabled',
        name: 'Disabled Q&A Link',
        document: 'doc-400',
        view_count: 1,
        created_at: new Date().toISOString(),
        qna_enabled: false,
        qna_total_threads: 0,
        qna_unresolved_threads: 0,
      },
    ];

    renderWithRouter(<LinksTable links={links} isDashboardWidget />);

    // Header column exists
    expect(screen.getByRole('columnheader', { name: /q&a/i })).toBeInTheDocument();

    // 1. Open questions link
    const openBadge = screen.getByText('2 open / 5');
    expect(openBadge).toBeInTheDocument();
    const openLink = openBadge.closest('a');
    expect(openLink).toHaveAttribute('href', '/datarooms/dr-100?tab=qna');

    // 2. All resolved link
    const resolvedBadge = screen.getByText('0 open / 4');
    expect(resolvedBadge).toBeInTheDocument();
    const resolvedLink = resolvedBadge.closest('a');
    expect(resolvedLink).toHaveAttribute('href', '/documents/doc-200#qna');

    // 3. Disabled Q&A
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});
