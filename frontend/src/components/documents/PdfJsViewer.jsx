import { useCallback, useEffect, useRef } from 'react';
import { recordPageView } from '../../services/api';

/**
 * PdfJsViewer
 *
 * Embeds a PDF using the browser-native viewer (<object> tag).
 * Provides:
 *  - Best-effort engagement analytics: tracks active-tab time and sends a
 *    page-view event on unmount (or when viewId changes).
 *  - Best-effort watermark overlay: renders a repeating CSS watermark over
 *    the viewer when `watermarkText` is provided. The overlay uses
 *    pointer-events:none so it does not block interaction.
 *
 * Limitations (documented as best-effort):
 *  - Page-level tracking is not possible from inside a browser-native PDF
 *    viewer. All engagement time is reported as page 1.
 *  - The CSS overlay can be bypassed by opening the signed PDF URL directly
 *    or via browser devtools. It is a visual deterrent, not DRM.
 */
export function PdfJsViewer({
  pdfUrl,
  title = 'PDF Document',
  viewId,
  dataroomVisitId,
  watermarkText = '',
}) {
  const activeTimeRef = useRef(0);
  const intervalRef = useRef(null);
  const isHiddenRef = useRef(false);

  const flushAnalytics = useCallback(
    (useBeacon = false) => {
      const duration = activeTimeRef.current;
      if (!viewId || duration < 1) return;
      const payload = {
        view_session: viewId,
        page_number: 1,
        duration_seconds: Math.round(duration),
      };
      if (dataroomVisitId) {
        payload.dataroom_visit = dataroomVisitId;
      }
      recordPageView(payload, useBeacon);
      activeTimeRef.current = 0;
    },
    [viewId, dataroomVisitId],
  );

  // Track active time (only while tab is visible)
  useEffect(() => {
    if (!viewId) return;

    const tick = () => {
      if (!isHiddenRef.current) {
        activeTimeRef.current += 1;
      }
    };

    const handleVisibilityChange = () => {
      isHiddenRef.current = document.hidden;
    };

    intervalRef.current = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Flush remaining time using sendBeacon so it survives page unload.
      flushAnalytics(true);
    };
  }, [viewId, flushAnalytics]);

  if (!pdfUrl) return null;

  return (
    <div className="relative h-full w-full">
      {/* Native PDF viewer */}
      <object
        data={pdfUrl}
        type="application/pdf"
        className="h-full w-full border-none"
        title={title}
      >
        <div className="flex h-full w-full items-center justify-center p-4 text-center text-gray-500">
          <p>
            Your browser does not support inline PDFs.{' '}
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Download the PDF
            </a>{' '}
            to view it.
          </p>
        </div>
      </object>

      {/* Best-effort CSS watermark overlay */}
      {watermarkText && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden select-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(buildWatermarkSvg(watermarkText))}")`,
            backgroundSize: '340px 180px',
            backgroundRepeat: 'repeat',
            opacity: 0.18,
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}

/**
 * Build an SVG tile for the repeating watermark background.
 * The text is rendered diagonally at -35°, matching the server-rendered style.
 */
function buildWatermarkSvg(text) {
  // Escape XML special characters
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="180">
    <text
      x="170"
      y="90"
      font-family="Arial, sans-serif"
      font-size="18"
      fill="#000000"
      text-anchor="middle"
      dominant-baseline="middle"
      transform="rotate(-35, 170, 90)"
    >${safe}</text>
  </svg>`;
}
