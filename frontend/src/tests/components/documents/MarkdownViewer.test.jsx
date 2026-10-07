import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { MarkdownViewer } from '../../../components/documents/MarkdownViewer';
import * as api from '../../../services/api';

vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: vi.fn(),
    post: vi.fn(),
  };
  return {
    default: {
      ...mockInstance,
      create: vi.fn(() => mockInstance),
    },
    ...mockInstance,
    create: vi.fn(() => mockInstance),
  };
});
vi.mock('../../../services/api');

describe('MarkdownViewer', () => {
  const viewId = 'view_123';
  const markdownUrl = 'https://example.com/test.md';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially and parses markdown content successfully', async () => {
    const markdownContent = '# Main Header\n\nThis is a **test** document with [ConeShare](https://coneshare.com).';
    axios.get.mockResolvedValueOnce({ data: markdownContent });

    render(<MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} />);

    expect(screen.getByText(/loading markdown/i)).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve(); // flush Axios promise
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Main Header' })).toBeInTheDocument();
    expect(screen.getByText(/This is a/)).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'ConeShare' });
    expect(link).toHaveAttribute('href', 'https://coneshare.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders error state when fetch fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('Network error loading document'));

    render(<MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/Preview unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('Network error loading document')).toBeInTheDocument();
  });

  it('sanitizes malicious XSS scripts, javascript: links and images', async () => {
    const maliciousMarkdown = `
# Security Test
<script>alert("xss")</script>
[Malicious Link](javascript:alert("attack"))
<a href="jav&#x09;ascript:alert(1)">Obfuscated</a>
<img src="javascript:alert(2)" alt="bad image" />
`;
    axios.get.mockResolvedValueOnce({ data: maliciousMarkdown });

    const { container } = render(<MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('script')).toBeNull();
    const badLinks = container.querySelectorAll('a');
    badLinks.forEach((a) => {
      const href = a.getAttribute('href');
      expect(href == null || !href.toLowerCase().includes('javascript:')).toBe(true);
    });
    const img = container.querySelector('img');
    if (img) {
      expect(img).not.toHaveAttribute('src', expect.stringContaining('javascript:'));
    }
  });

  it('preserves internal fragment anchors without setting target="_blank" and scrolls smoothly', async () => {
    const anchorMarkdown = `
[Jump to Section](#target-section)

<h2 id="target-section">Target Section</h2>
`;
    axios.get.mockResolvedValueOnce({ data: anchorMarkdown });

    render(<MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} />);

    await act(async () => {
      await Promise.resolve();
    });

    const link = screen.getByRole('link', { name: 'Jump to Section' });
    expect(link).toHaveAttribute('href', '#target-section');
    expect(link).not.toHaveAttribute('target');

    // Mock scrollIntoView
    const heading = screen.getByRole('heading', { level: 2, name: 'Target Section' });
    const scrollIntoViewMock = vi.fn();
    heading.scrollIntoView = scrollIntoViewMock;

    fireEvent.click(link);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(api.recordLinkClick).not.toHaveBeenCalled();
  });

  it('tracks outbound link clicks with useLinkClickTracking', async () => {
    const linkMarkdown = '[External Resource](https://docs.example.com)';
    axios.get.mockResolvedValueOnce({ data: linkMarkdown });

    render(<MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} dataroomVisitId="visit_456" />);

    await act(async () => {
      await Promise.resolve();
    });

    const link = screen.getByRole('link', { name: 'External Resource' });
    fireEvent.click(link);

    expect(api.recordLinkClick).toHaveBeenCalledWith({
      view_session: viewId,
      dataroom_visit: 'visit_456',
      page_number: 1,
      url: 'https://docs.example.com',
    });
  });

  it('displays watermark overlay when watermarkText is provided', async () => {
    axios.get.mockResolvedValueOnce({ data: '# Watermarked Content' });

    render(
      <MarkdownViewer
        markdownUrl={markdownUrl}
        viewId={viewId}
        watermarkText="RESTRICTED PREVIEW"
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const watermark = screen.getByTestId('markdown-watermark');
    expect(watermark).toBeInTheDocument();
    expect(watermark.style.backgroundImage).toContain(encodeURIComponent('RESTRICTED PREVIEW'));
  });

  it('enforces copy protection when allowDownload is false or watermarked', async () => {
    axios.get.mockResolvedValueOnce({ data: '# Protected Content' });

    const { rerender } = render(
      <MarkdownViewer
        markdownUrl={markdownUrl}
        viewId={viewId}
        allowDownload={false}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const container = screen.getByRole('region');
    expect(container).toHaveClass('select-none');

    const copyEvent = new Event('copy', { bubbles: true, cancelable: true });
    container.dispatchEvent(copyEvent);
    expect(copyEvent.defaultPrevented).toBe(true);

    // When allowDownload is true and no watermark, copy is not prevented
    rerender(
      <MarkdownViewer
        markdownUrl={markdownUrl}
        viewId={viewId}
        allowDownload={true}
        watermarkText=""
      />
    );

    expect(container).not.toHaveClass('select-none');
    const allowedCopyEvent = new Event('copy', { bubbles: true, cancelable: true });
    container.dispatchEvent(allowedCopyEvent);
    expect(allowedCopyEvent.defaultPrevented).toBe(false);
  });

  it('records duration and scroll_percentage via recordPageView on unmount and heartbeat', async () => {
    axios.get.mockResolvedValueOnce({ data: '# Long Markdown Document' });

    const { unmount } = render(
      <MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} dataroomVisitId="visit_789" />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const container = screen.getByRole('region');

    // Simulate scrolling halfway through the document
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 500, configurable: true });

    act(() => {
      fireEvent.scroll(container);
    });

    // Advance timer by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Unmount should flush recorded reading time
    unmount();

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        view_session: viewId,
        dataroom_visit: 'visit_789',
        page_number: 1,
        duration_seconds: 5,
        scroll_percentage: 50, // (500 + 500) / 2000 = 50%
        media_type: 'markdown',
      }),
      false
    );
  });

  it('flushes scroll depth on fast exit (duration < 1s) when new scroll occurred', async () => {
    axios.get.mockResolvedValueOnce({ data: '# Fast Scroll Document' });

    const { unmount } = render(
      <MarkdownViewer markdownUrl={markdownUrl} viewId={viewId} dataroomVisitId="visit_fast" />
    );

    await act(async () => {
      await Promise.resolve();
    });

    const container = screen.getByRole('region');

    // Simulate scrolling 80% through the document
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 1200, configurable: true });

    act(() => {
      fireEvent.scroll(container);
    });

    // Exit immediately without advancing time (duration < 1)
    unmount();

    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        view_session: viewId,
        dataroom_visit: 'visit_fast',
        page_number: 1,
        duration_seconds: 0,
        scroll_percentage: 80, // (1200 + 400) / 2000 = 80%
        media_type: 'markdown',
      }),
      false
    );
  });
});
