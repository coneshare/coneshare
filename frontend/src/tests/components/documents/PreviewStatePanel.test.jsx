import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import i18n from '../../../i18n';
import {
  PreviewStatePanel,
  isPreviewPending,
  isPreviewFailed,
  hasRenderablePages,
} from '../../../components/documents/PreviewStatePanel';

describe('PreviewStatePanel Helper Functions', () => {
  it('identifies pending preview statuses correctly', () => {
    expect(isPreviewPending({ preview_status: 'not_generated' })).toBe(true);
    expect(isPreviewPending({ preview_status: 'processing' })).toBe(true);
    expect(isPreviewPending({ preview_status: 'completed' })).toBe(false);
    expect(isPreviewPending({ preview_status: 'failed' })).toBe(false);
    expect(isPreviewPending(null)).toBe(false);
  });

  it('identifies failed preview statuses correctly', () => {
    expect(isPreviewFailed({ preview_status: 'failed' })).toBe(true);
    expect(isPreviewFailed({ render_status: 'failed' })).toBe(true);
    expect(isPreviewFailed({ preview_status: 'processing' })).toBe(false);
    expect(isPreviewFailed({ render_status: 'success' })).toBe(false);
  });

  it('checks hasRenderablePages correctly', () => {
    expect(hasRenderablePages({ pages: [{ page_number: 1 }] })).toBe(true);
    expect(hasRenderablePages({ pages: [] })).toBe(false);
    expect(hasRenderablePages({ pages: null })).toBe(false);
    expect(hasRenderablePages({})).toBe(false);
  });
});

describe('PreviewStatePanel Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders pending state with file information and download button', () => {
    const documentData = {
      name: 'Quarterly_Report.pdf',
      type: 'pdf',
      file_size: 2048576,
      preview_status: 'processing',
      download_url: '/download/quarterly-report.pdf',
    };

    render(
      <PreviewStatePanel
        documentData={documentData}
        allowDownload={true}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      i18n.t('viewer.preparingPreview')
    );
    expect(screen.getByText(i18n.t('viewer.preparingPreviewNotice'))).toBeInTheDocument();
    expect(screen.getByText('Quarterly_Report.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.95 MB')).toBeInTheDocument();

    const downloadLink = screen.getByRole('link', { name: new RegExp(i18n.t('viewer.download'), 'i') });
    expect(downloadLink).toBeInTheDocument();
    expect(downloadLink).toHaveAttribute('href', '/download/quarterly-report.pdf');
  });

  it('renders failed state with localized error message', () => {
    const documentData = {
      name: 'corrupted_file.docx',
      type: 'document',
      preview_status: 'failed',
      render_error: 'Conversion timeout occurred',
    };

    render(
      <PreviewStatePanel
        documentData={documentData}
        allowDownload={false}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      i18n.t('viewer.previewUnavailable')
    );
    expect(screen.getByText(i18n.t('viewer.downloadDisabledNotice'))).toBeInTheDocument();
    const downloadButton = screen.getByRole('button', { name: new RegExp(i18n.t('viewer.download'), 'i') });
    expect(downloadButton).toBeDisabled();
  });

  it('displays retry option after timeout when stuck in pending', () => {
    const onRetry = vi.fn();
    const documentData = {
      name: 'heavy_presentation.pptx',
      preview_status: 'processing',
    };

    render(
      <PreviewStatePanel
        documentData={documentData}
        onRetry={onRetry}
      />
    );

    expect(screen.queryByText(i18n.t('viewer.retryGeneration'))).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    const retryBtn = screen.getByText(i18n.t('viewer.retryGeneration'));
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('supports custom title and message overrides', () => {
    const documentData = {
      name: 'custom.txt',
    };

    render(
      <PreviewStatePanel
        documentData={documentData}
        title="Custom Header"
        message="Custom Subtitle Message"
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Custom Header' })).toBeInTheDocument();
    expect(screen.getByText('Custom Subtitle Message')).toBeInTheDocument();
  });
});
