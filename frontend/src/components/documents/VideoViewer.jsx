import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { recordPageView } from '../../services/api';

export const VideoViewer = forwardRef(({
  videoUrl,
  viewId,
  dataroomVisitId,
  watermarkText = '',
}, ref) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const timeWatchedAccumulator = useRef(0);
  const lastTickTime = useRef(null);
  const trackingIntervalRef = useRef(null);

  // Expose play/pause if needed
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }));

  const sendTrackingData = (duration, useBeacon = false) => {
    if (!viewId || duration < 1) return;
    const payload = {
      view_session: viewId,
      page_number: 1, // Video acts as a single-page document for view-page tracking
      duration_seconds: Math.round(duration),
    };
    if (dataroomVisitId) {
      payload.dataroom_visit = dataroomVisitId;
    }
    recordPageView(payload, useBeacon);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 30, // Limit buffer size to prevent memory pressure
      });
      hlsRef.current = hls;
      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = videoUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl]);

  // Keep track of accumulated watch time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      lastTickTime.current = Date.now();
      if (!trackingIntervalRef.current) {
        trackingIntervalRef.current = setInterval(() => {
          if (video && !video.paused) {
            const now = Date.now();
            const delta = (now - lastTickTime.current) / 1000;
            timeWatchedAccumulator.current += delta;
            lastTickTime.current = now;

            // Heartbeat check: every 10 seconds of accumulated watch time, send to backend
            if (timeWatchedAccumulator.current >= 10) {
              sendTrackingData(timeWatchedAccumulator.current);
              timeWatchedAccumulator.current = 0;
            }
          }
        }, 1000);
      }
    };

    const handlePauseOrSeek = () => {
      if (lastTickTime.current && !video.paused) {
        const now = Date.now();
        const delta = (now - lastTickTime.current) / 1000;
        timeWatchedAccumulator.current += delta;
      }
      lastTickTime.current = null;
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePauseOrSeek);
    video.addEventListener('seeking', handlePauseOrSeek);
    video.addEventListener('seeked', () => {
      if (!video.paused) {
        lastTickTime.current = Date.now();
      }
    });
    video.addEventListener('ended', () => {
      handlePauseOrSeek();
      if (timeWatchedAccumulator.current > 0) {
        sendTrackingData(timeWatchedAccumulator.current);
        timeWatchedAccumulator.current = 0;
      }
    });

    return () => {
      if (video) {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePauseOrSeek);
        video.removeEventListener('seeking', handlePauseOrSeek);
        video.removeEventListener('ended', handlePauseOrSeek);
      }
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    };
  }, [viewId, dataroomVisitId]);

  // Handle final tracking send on beforeunload or unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current && !videoRef.current.paused && lastTickTime.current) {
        const now = Date.now();
        const delta = (now - lastTickTime.current) / 1000;
        timeWatchedAccumulator.current += delta;
      }
      if (timeWatchedAccumulator.current > 0) {
        sendTrackingData(timeWatchedAccumulator.current, true);
        timeWatchedAccumulator.current = 0;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  return (
    <div className="relative w-full max-w-4xl mx-auto bg-black rounded-lg overflow-hidden shadow-xl aspect-video">
      <video
        ref={videoRef}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full object-contain"
      />
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
});

VideoViewer.displayName = 'VideoViewer';

function buildWatermarkSvg(text) {
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
