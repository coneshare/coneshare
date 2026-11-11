import React from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import i18n from '../../i18n';

function getSanitizedUrl() {
  try {
    const parsed = new URL(window.location.href);
    const SENSITIVE_PARAMS = ['token', 'uid', 'key', 'secret', 'password', 'code', 'auth', 'previewtoken'];
    const redactParams = (params) => {
      const keys = Array.from(params.keys());
      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_PARAMS.some((p) => lowerKey.includes(p))) {
          params.set(key, '[REDACTED]');
        }
      }
    };

    redactParams(parsed.searchParams);

    if (parsed.hash && (parsed.hash.includes('?') || parsed.hash.includes('='))) {
      const hasQuestion = parsed.hash.includes('?');
      const hashQueryStr = hasQuestion
        ? parsed.hash.slice(parsed.hash.indexOf('?') + 1)
        : parsed.hash.slice(1);
      const prefix = hasQuestion
        ? `${parsed.hash.slice(0, parsed.hash.indexOf('?'))}?`
        : '#';
      const hashParams = new URLSearchParams(hashQueryStr);
      redactParams(hashParams);
      parsed.hash = `${prefix}${hashParams.toString()}`;
    }

    try {
      return decodeURI(parsed.toString());
    } catch {
      return parsed.toString();
    }
  } catch {
    return window.location.pathname || 'unknown';
  }
}

export class GlobalErrorBoundary extends React.Component {
  static getSanitizedUrl = getSanitizedUrl;
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
    this.copyTimeout = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('Unhandled Application Crash caught by GlobalErrorBoundary:', error, errorInfo);

    // Auto-reload on stale chunk failures after new deployments (scoped to 20-second window)
    const isChunkLoadFailed =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('error loading dynamically imported module');

    if (isChunkLoadFailed) {
      try {
        const reloadKey = `chunk_reload_${window.location.pathname}`;
        const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
        if (Date.now() - lastReload > 20000) {
          sessionStorage.setItem(reloadKey, String(Date.now()));
          window.location.reload();
        }
      } catch (storageError) {
        // Ignore storage access errors in private browsing / restricted contexts
      }
    }
  }

  componentWillUnmount() {
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
      this.copyTimeout = null;
    }
  }

  setCopiedState = () => {
    this.setState({ copied: true });
    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout);
    }
    this.copyTimeout = setTimeout(() => {
      this.setState({ copied: false });
    }, 2000);
  };

  copyViaTextareaFallback = (textToCopy) => {
    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.setCopiedState();
      }
    } catch (e) {
      console.error('Failed to copy error report via fallback:', e);
    } finally {
      document.body.removeChild(textarea);
    }
  };

  handleCopyReport = () => {
    const report = {
      name: this.state.error?.name,
      message: this.state.error?.message || String(this.state.error),
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      url: getSanitizedUrl(),
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    const textToCopy = JSON.stringify(report, null, 2);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          this.setCopiedState();
        })
        .catch(() => {
          this.copyViaTextareaFallback(textToCopy);
        });
    } else {
      this.copyViaTextareaFallback(textToCopy);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || String(this.state.error);
      const isInline = Boolean(this.props.inline);
      const t = (key, fallback) => (i18n?.t ? i18n.t(key, fallback) : fallback);

      return (
        <div
          className={
            isInline
              ? "flex h-full min-h-[450px] w-full flex-col items-center justify-center p-6 text-gray-900 dark:text-gray-100"
              : "flex min-h-screen w-full items-center justify-center p-6 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          }
        >
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-700 dark:bg-gray-800">
            {/* Header / Icon */}
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">
                  {t('errorBoundary.title', 'Something went wrong')}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('errorBoundary.description', 'An unexpected error occurred while rendering this page.')}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="my-6 flex flex-wrap items-center gap-3">
              <Button onClick={this.handleReload} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                {t('errorBoundary.reloadPage', 'Reload Page')}
              </Button>
              <Button onClick={this.handleCopyReport} variant="secondary" className="ml-auto flex items-center gap-2">
                {this.state.copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {this.state.copied
                  ? t('errorBoundary.reportCopied', 'Report Copied!')
                  : t('errorBoundary.copyDiagnosticInfo', 'Copy Diagnostic Info')}
              </Button>
            </div>

            {/* Diagnostic Details */}
            <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900/50">
              <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                {t('errorBoundary.technicalDetails', 'Technical Details')}: <span className="font-mono text-red-600 dark:text-red-400">{errorMsg}</span>
              </summary>
              <div className="mt-3 space-y-2">
                <div>
                  <span className="font-semibold text-gray-500">{t('errorBoundary.url', 'URL')}:</span>
                  <div className="font-mono text-gray-600 dark:text-gray-400 break-all">{getSanitizedUrl()}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-500">{t('errorBoundary.browser', 'Browser')}:</span>
                  <div className="font-mono text-gray-600 dark:text-gray-400 break-all">{navigator.userAgent}</div>
                </div>
                {this.state.error?.stack && (
                  <div>
                    <span className="font-semibold text-gray-500">{t('errorBoundary.stackTrace', 'Stack Trace')}:</span>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-2 font-mono text-red-600 dark:bg-gray-950 dark:text-red-400">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
                {this.state.errorInfo?.componentStack && (
                  <div>
                    <span className="font-semibold text-gray-500">{t('errorBoundary.componentStack', 'Component Stack')}:</span>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-2 font-mono text-gray-600 dark:bg-gray-950 dark:text-gray-400">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default GlobalErrorBoundary;
