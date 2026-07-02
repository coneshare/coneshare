import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { Download } from 'lucide-react';
import { recordPageView, recordDownload } from '../../services/api';

export const VideoViewer = forwardRef(({
  videoUrl,
  viewId,
  dataroomVisitId,
  watermarkText = '',
  allowDownload = false,
  downloadUrl = '',
}, ref) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const timeWatchedAccumulator = useRef(0);
  const lastTickTime = useRef(null);
  const trackingIntervalRef = useRef(null);
  const lastTrackedPosition = useRef(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef(null);

  // Expose play/pause if needed
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownload = (e) => {
    e.stopPropagation();
    if (downloadUrl) {
      if (viewId) {
        recordDownload(viewId).catch(err => 
          console.error("Failed to record download", err)
        );
      }
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', '');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const toggleSpeedMenu = (e) => {
    e.stopPropagation();
    setShowSpeedMenu((prev) => !prev);
  };

  const sendTrackingData = (duration, useBeacon = false) => {
    if (!viewId || duration < 0.1) return;
    const video = videoRef.current;
    
    const startTime = lastTrackedPosition.current;
    const endTime = video ? video.currentTime : startTime + duration;
    const volume = video ? (video.muted ? 0 : Math.round(video.volume * 100)) : 100;
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    const speed = video ? video.playbackRate : 1.0;

    const payload = {
      view_session: viewId,
      page_number: 1, // Video acts as a single-page document for view-page tracking
      duration_seconds: Math.round(duration),
      video_start_time: Math.round(startTime * 10) / 10,
      video_end_time: Math.round(endTime * 10) / 10,
      video_volume: volume,
      is_fullscreen: isFullscreen,
      playback_speed: speed,
    };
    if (dataroomVisitId) {
      payload.dataroom_visit = dataroomVisitId;
    }
    recordPageView(payload, useBeacon);
    
    if (video) {
      lastTrackedPosition.current = video.currentTime;
    }
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
      lastTrackedPosition.current = video.currentTime;
      
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
      
      trackingIntervalRef.current = setInterval(() => {
        if (video && !video.paused && lastTickTime.current) {
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
    };

    const flushTrackingData = () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      if (lastTickTime.current) {
        const now = Date.now();
        const delta = (now - lastTickTime.current) / 1000;
        timeWatchedAccumulator.current += delta;
      }
      if (timeWatchedAccumulator.current > 0) {
        sendTrackingData(timeWatchedAccumulator.current);
        timeWatchedAccumulator.current = 0;
      }
      lastTickTime.current = null;
    };

    const handleRateChange = () => {
      flushTrackingData();
      setPlaybackSpeed(video.playbackRate);
      if (!video.paused) {
        handlePlay();
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', flushTrackingData);
    video.addEventListener('seeking', flushTrackingData);
    video.addEventListener('ratechange', handleRateChange);
    video.addEventListener('seeked', () => {
      if (!video.paused) {
        handlePlay();
      }
    });
    video.addEventListener('ended', () => {
      flushTrackingData();
    });

    return () => {
      if (video) {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', flushTrackingData);
        video.removeEventListener('seeking', flushTrackingData);
        video.removeEventListener('ratechange', handleRateChange);
        video.removeEventListener('ended', flushTrackingData);
      }
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
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
    <div className="relative w-full max-w-6xl mx-auto bg-black rounded-xl overflow-hidden shadow-2xl aspect-video max-h-[80vh]">
      <video
        ref={videoRef}
        controls
        controlsList={allowDownload ? undefined : "nodownload"}
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
      <div
        ref={speedMenuRef}
        className={`absolute top-4 z-20 ${
          allowDownload && downloadUrl ? 'right-16' : 'right-4'
        }`}
      >
        <button
          onClick={toggleSpeedMenu}
          title="Playback Speed"
          className="flex h-10 px-3 items-center justify-center rounded-full bg-black/40 text-xs font-bold text-white backdrop-blur transition-all duration-200 hover:bg-black/70 hover:scale-105 shadow-md font-mono"
        >
          {playbackSpeed}x
        </button>
        {showSpeedMenu && (
          <div className="absolute right-0 top-12 z-30 w-20 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md">
            {[1.0, 1.25, 1.5, 2.0].map((speed) => (
              <button
                key={speed}
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoRef.current) {
                    videoRef.current.playbackRate = speed;
                  }
                  setShowSpeedMenu(false);
                }}
                className={`flex w-full items-center justify-center rounded px-2 py-1 text-xs font-semibold font-mono transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-white/20 text-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {speed.toFixed(2).replace(/\.00$/, '')}x
              </button>
            ))}
          </div>
        )}
      </div>
      {allowDownload && downloadUrl && (
        <button
          onClick={handleDownload}
          title="Download video"
          className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-all duration-200 hover:bg-black/70 hover:scale-105 shadow-md"
        >
          <Download className="h-5 w-5" />
        </button>
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
