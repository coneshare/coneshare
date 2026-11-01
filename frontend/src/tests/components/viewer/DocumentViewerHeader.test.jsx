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

  it('omits brand logo img when brandLogoUrl is not provided (logo_mode none)', () => {
    render(<DocumentViewerHeader {...defaultProps} brandLogoUrl={null} />);

    expect(screen.queryByRole('img', { name: /acme corp logo/i })).not.toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders watermarked badge when isWatermarked is true', () => {
    render(<DocumentViewerHeader {...defaultProps} isWatermarked={true} />);

    expect(screen.getByTestId('header-watermarked-badge')).toBeInTheDocument();
  });

  it('does not render visitor mode badge in header (consolidated into hero banner)', () => {
    render(<DocumentViewerHeader {...defaultProps} hasViewSession={true} />);

    expect(screen.queryByTestId('header-tracked-badge')).not.toBeInTheDocument();
  });

  it('renders NDA badge when isNdaProtected is true', () => {
    render(<DocumentViewerHeader {...defaultProps} isNdaProtected={true} />);

    expect(screen.getByTestId('header-nda-badge')).toBeInTheDocument();
    expect(screen.getByText(/NDA Active/i)).toBeInTheDocument();
  });

  it('renders Download all button and fires onDownloadAll when isDownloadAllAllowed is true', async () => {
    const handleDownloadAll = vi.fn();
    render(
      <DocumentViewerHeader
        documentName="Deal Room"
        isDownloadAllAllowed={true}
        onDownloadAll={handleDownloadAll}
        downloadAllButtonLabel="Download all"
      />
    );

    const downloadAllBtn = screen.getByRole('button', { name: 'Download all' });
    expect(downloadAllBtn).toBeInTheDocument();

    fireEvent.click(downloadAllBtn);
    expect(handleDownloadAll).toHaveBeenCalledTimes(1);
  });

  it('hides Download all button when isDownloadAllAllowed is false', () => {
    render(
      <DocumentViewerHeader
        documentName="Deal Room"
        isDownloadAllAllowed={false}
      />
    );

    expect(screen.queryByRole('button', { name: 'Download all' })).not.toBeInTheDocument();
  });

  it('disables Download all button when isDownloadingAll is true', () => {
    render(
      <DocumentViewerHeader
        documentName="Deal Room"
        isDownloadAllAllowed={true}
        isDownloadingAll={true}
        downloadAllButtonLabel="Download all"
      />
    );

    const downloadAllBtn = screen.getByRole('button', { name: 'Download all' });
    expect(downloadAllBtn).toBeDisabled();
  });
});

