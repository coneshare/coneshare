import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalErrorBoundary } from '../../../components/common/GlobalErrorBoundary';

function BrokenComponent({ shouldThrow = true }) {
  if (shouldThrow) {
    throw new Error("Test intentional crash: Iterator not found");
  }
  return <div>Component Loaded Normally</div>;
}

describe('GlobalErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <GlobalErrorBoundary>
        <BrokenComponent shouldThrow={false} />
      </GlobalErrorBoundary>
    );

    expect(screen.getByText('Component Loaded Normally')).toBeInTheDocument();
  });

  it('catches render error and displays diagnostic crash UI', () => {
    render(
      <GlobalErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </GlobalErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Reload Page')).toBeInTheDocument();
    expect(screen.getByText('Copy Diagnostic Info')).toBeInTheDocument();
    expect(screen.getAllByText(/Test intentional crash: Iterator not found/).length).toBeGreaterThan(0);
  });

  it('renders inline styles when inline prop is passed', () => {
    const { container } = render(
      <GlobalErrorBoundary inline>
        <BrokenComponent shouldThrow={true} />
      </GlobalErrorBoundary>
    );

    const wrapper = container.firstChild;
    expect(wrapper.className).toContain('min-h-[450px]');
    expect(wrapper.className).not.toContain('min-h-screen');
  });

  it('copies error report when Copy Diagnostic Info is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <GlobalErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </GlobalErrorBoundary>
    );

    const copyBtn = screen.getByText('Copy Diagnostic Info');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    const copiedJson = JSON.parse(writeTextMock.mock.calls[0][0]);
    expect(copiedJson.message).toBe('Test intentional crash: Iterator not found');
    expect(copiedJson.url).toBeDefined();
    expect(copiedJson.userAgent).toBeDefined();
  });

  it('falls back to document.execCommand when writeText rejects', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const execCommandMock = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandMock;

    render(
      <GlobalErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </GlobalErrorBoundary>
    );

    const copyBtn = screen.getByText('Copy Diagnostic Info');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    // Allow the promise rejection microtask to execute the fallback
    await vi.waitFor(() => {
      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });
  });

  it('cleans up copyTimeout timer on unmount', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { unmount } = render(
      <GlobalErrorBoundary>
        <BrokenComponent shouldThrow={true} />
      </GlobalErrorBoundary>
    );

    const copyBtn = screen.getByText('Copy Diagnostic Info');
    fireEvent.click(copyBtn);

    await vi.waitFor(() => {
      expect(screen.getByText('Report Copied!')).toBeInTheDocument();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  describe('URL sanitization and credential redaction', () => {
    it('redacts sensitive query and hash parameters in getSanitizedUrl, UI, and copied report', async () => {
      const originalHref = window.location.href;
      window.history.pushState(
        {},
        '',
        '/documents/preview?token=secret-token-123&uid=user-999&previewToken=pv-456&code=auth-code-789&view=grid#access_token=hash-token-abc&section=summary'
      );

      const sanitized = GlobalErrorBoundary.getSanitizedUrl();
      expect(sanitized).not.toContain('secret-token-123');
      expect(sanitized).not.toContain('user-999');
      expect(sanitized).not.toContain('pv-456');
      expect(sanitized).not.toContain('auth-code-789');
      expect(sanitized).not.toContain('hash-token-abc');
      expect(sanitized).toContain('token=[REDACTED]');
      expect(sanitized).toContain('uid=[REDACTED]');
      expect(sanitized).toContain('previewToken=[REDACTED]');
      expect(sanitized).toContain('code=[REDACTED]');
      expect(sanitized).toContain('view=grid');
      expect(sanitized).toContain('section=summary');

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <GlobalErrorBoundary>
          <BrokenComponent shouldThrow={true} />
        </GlobalErrorBoundary>
      );

      // Verify UI details displays sanitized URL
      expect(screen.getByText(sanitized)).toBeInTheDocument();

      // Verify copied JSON contains sanitized URL
      const copyBtn = screen.getByText('Copy Diagnostic Info');
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalled();
      const copiedJson = JSON.parse(writeTextMock.mock.calls[0][0]);
      expect(copiedJson.url).toBe(sanitized);

      window.history.pushState({}, '', originalHref);
    });
  });

  describe('ChunkLoadError auto-reload guard', () => {
    let originalLocation;
    let reloadMock;

    beforeEach(() => {
      sessionStorage.clear();
      originalLocation = window.location;
      reloadMock = vi.fn();
      delete window.location;
      window.location = {
        ...originalLocation,
        pathname: '/documents',
        reload: reloadMock,
      };
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('triggers reload on chunk failure and throttles reloads within 20 seconds', () => {
      const now = 1700000000000;
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      function ChunkFailureComponent() {
        const err = new Error('error loading dynamically imported module /src/pages/DocumentPage.jsx');
        err.name = 'ChunkLoadError';
        throw err;
      }

      const { unmount } = render(
        <GlobalErrorBoundary>
          <ChunkFailureComponent />
        </GlobalErrorBoundary>
      );

      expect(reloadMock).toHaveBeenCalledTimes(1);
      const reloadKey = `chunk_reload_${window.location.pathname}`;
      expect(sessionStorage.getItem(reloadKey)).toBe(String(now));

      unmount();
      reloadMock.mockClear();

      // Trigger again 10 seconds later (within 20s window) -> should not reload
      nowSpy.mockReturnValue(now + 10000);
      const { unmount: unmount2 } = render(
        <GlobalErrorBoundary>
          <ChunkFailureComponent />
        </GlobalErrorBoundary>
      );

      expect(reloadMock).not.toHaveBeenCalled();

      unmount2();
      reloadMock.mockClear();

      // Trigger again 25 seconds later (> 20s window) -> should reload
      nowSpy.mockReturnValue(now + 25000);
      render(
        <GlobalErrorBoundary>
          <ChunkFailureComponent />
        </GlobalErrorBoundary>
      );

      expect(reloadMock).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(reloadKey)).toBe(String(now + 25000));
    });

    it('catches and handles sessionStorage SecurityError in private browsing gracefully', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });

      function ChunkFailureComponent() {
        const err = new Error('Importing a module script failed.');
        throw err;
      }

      expect(() => {
        render(
          <GlobalErrorBoundary>
            <ChunkFailureComponent />
          </GlobalErrorBoundary>
        );
      }).not.toThrow();

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      getItemSpy.mockRestore();
    });
  });
});
