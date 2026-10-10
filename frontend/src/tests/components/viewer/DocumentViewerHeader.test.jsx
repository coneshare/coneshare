import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentViewerHeader } from '../../../components/viewer/DocumentViewerHeader';
import '../../../i18n';

describe('DocumentViewerHeader', () => {
  const defaultProps = {
    documentName: 'Test Document.pdf',
    brandName: 'Acme Corp',
    brandLogoUrl: '/logo.svg',
    brandWebsiteUrl: 'https://example.com',
    ownerName: 'Alice Owner',
    ownerAvatarUrl: '/avatar.png',
    isQnaEnabled: true,
    isQnaOpen: false,
    onToggleQna: vi.fn(),
    qnaButtonLabel: 'Open Q&A',
    qnaText: null,
    qnaThreadCount: 0,
    hasViewSession: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders brand name, logo, document title, and owner chip correctly', () => {
    render(<DocumentViewerHeader {...defaultProps} />);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /acme corp logo/i })).toHaveAttribute('src', '/logo.svg');
    expect(screen.getByRole('heading', { name: 'Test Document.pdf' })).toBeInTheDocument();
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('AO')).toBeInTheDocument(); // Initials fallback
  });

  it('omits document title container when documentName is not provided', () => {
    render(<DocumentViewerHeader {...defaultProps} documentName="" />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('omits owner chip when ownerName is empty', () => {
    render(<DocumentViewerHeader {...defaultProps} ownerName={null} />);

    expect(screen.queryByText('Alice Owner')).not.toBeInTheDocument();
  });

  it('applies --viewer-primary CSS variable styling to brand link and title', () => {
    render(
      <div style={{ '--viewer-primary': '#0f766e' }}>
        <DocumentViewerHeader {...defaultProps} />
      </div>
    );

    const brandLink = screen.getByText('Acme Corp').closest('a');
    expect(brandLink).toHaveStyle({ color: 'var(--viewer-primary, #111827)' });

    const titleEl = screen.getByRole('heading', { name: 'Test Document.pdf' });
    expect(titleEl).toHaveStyle({ color: 'var(--viewer-primary, #374151)' });
  });

  it('renders Q&A button, fires onToggleQna, and reflects aria-pressed', () => {
    const onToggleQna = vi.fn();
    const { rerender } = render(
      <DocumentViewerHeader
        {...defaultProps}
        isQnaOpen={false}
        onToggleQna={onToggleQna}
      />
    );

    const qnaButton = screen.getByRole('button', { name: 'Open Q&A' });
    expect(qnaButton).toHaveAttribute('aria-pressed', 'false');
    expect(qnaButton).not.toBeDisabled();

    fireEvent.click(qnaButton);
    expect(onToggleQna).toHaveBeenCalledTimes(1);

    rerender(
      <DocumentViewerHeader
        {...defaultProps}
        isQnaOpen={true}
        onToggleQna={onToggleQna}
      />
    );
    expect(qnaButton).toHaveAttribute('aria-pressed', 'true');
    expect(qnaButton).toHaveClass('bg-gray-100');
  });

  it('disables Q&A button when hasViewSession is false', () => {
    render(<DocumentViewerHeader {...defaultProps} hasViewSession={false} />);

    const qnaButton = screen.getByRole('button', { name: 'Open Q&A' });
    expect(qnaButton).toBeDisabled();
  });

  it('displays Q&A thread count badge when qnaThreadCount > 0', () => {
    render(<DocumentViewerHeader {...defaultProps} qnaThreadCount={3} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('supports custom qnaText prop override (e.g. for Dataroom Document Q&A)', () => {
    render(<DocumentViewerHeader {...defaultProps} qnaText="Document Q&A" />);

    expect(screen.getByText('Document Q&A')).toBeInTheDocument();
  });

  it('hides Q&A button when isQnaEnabled is false', () => {
    render(<DocumentViewerHeader {...defaultProps} isQnaEnabled={false} />);

    expect(screen.queryByRole('button', { name: 'Open Q&A' })).not.toBeInTheDocument();
  });
});
