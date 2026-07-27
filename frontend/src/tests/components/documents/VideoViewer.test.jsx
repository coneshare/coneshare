import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoViewer } from '../../../components/documents/VideoViewer';
import * as api from '../../../services/api';
import Hls from 'hls.js';

vi.mock('hls.js', () => {
  const mockHls = vi.fn().mockImplementation(() => ({
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  }));
  mockHls.isSupported = vi.fn().mockReturnValue(true);
  mockHls.Events = { ERROR: 'hlsError' };
  mockHls.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
  return { default: mockHls };
});

vi.mock('../../../services/api', () => ({
  recordPageView: vi.fn(),
}));

describe('VideoViewer', () => {
  const videoUrl = 'http://example.com/playlist.m3u8';
  const viewId = 'view_abc';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Hls.isSupported.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders video element with correct attributes by default', () => {
    const { container } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} />
    );

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('controlsList', 'nodownload');
    expect(video).toHaveAttribute('disablePictureInPicture');
  });

  it('initializes hls.js when supported', () => {
    render(<VideoViewer videoUrl={videoUrl} viewId={viewId} />);

    expect(Hls).toHaveBeenCalled();
    const hlsInstance = vi.mocked(Hls).mock.results[0].value;
    expect(hlsInstance.loadSource).toHaveBeenCalledWith(videoUrl);
    expect(hlsInstance.attachMedia).toHaveBeenCalled();
  });

  it('falls back to native src when hls.js is not supported but browser supports mpegurl natively', () => {
    Hls.isSupported.mockReturnValue(false);
    
    // Mock native playback capabilities
    const mockCanPlayType = vi.fn().mockReturnValue('maybe');
    const originalCreateElement = document.createElement;
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement.call(document, tagName);
      if (tagName === 'video') {
        el.canPlayType = mockCanPlayType;
      }
      return el;
    });

    render(<VideoViewer videoUrl={videoUrl} viewId={viewId} />);

    expect(Hls).not.toHaveBeenCalled();
    expect(mockCanPlayType).toHaveBeenCalledWith('application/vnd.apple.mpegurl');
    
    document.createElement.mockRestore();
  });

  it('sends tracking data on pause', () => {
    const { container } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} />
    );
    const video = container.querySelector('video');

    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => false,
    });
    
    let startTime = Date.now();
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => (Date.now() - startTime) / 1000,
    });

    // Simulate play
    act(() => {
      video.dispatchEvent(new Event('play'));
    });

    // Advance time by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Simulate pause
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(video, 'volume', {
      configurable: true,
      writable: true,
      value: 0.5,
    });
    act(() => {
      video.dispatchEvent(new Event('pause'));
    });

    // It should have sent tracking data immediately on pause
    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        view_session: viewId,
        page_number: 1,
        duration_seconds: 5,
        video_start_time: 0,
        video_end_time: 5,
        video_volume: 50,
        is_fullscreen: false,
        playback_speed: 1,
      }),
      false
    );
  });

  it('sends heartbeat when watch duration reaches 10 seconds', () => {
    const { container } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} />
    );
    const video = container.querySelector('video');

    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => false,
    });
    
    let startTime = Date.now();
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => (Date.now() - startTime) / 1000,
    });

    // Simulate play
    act(() => {
      video.dispatchEvent(new Event('play'));
    });

    // Advance time by 11 seconds (11 ticks)
    act(() => {
      vi.advanceTimersByTime(11000);
    });

    // Should have sent a heartbeat for the first 10 seconds
    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        view_session: viewId,
        page_number: 1,
        duration_seconds: 10,
        video_start_time: 0,
        video_end_time: 10,
      }),
      false
    );
  });

  it('sends remaining duration on unmount', () => {
    const { container, unmount } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} />
    );
    const video = container.querySelector('video');

    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => false,
    });
    
    let startTime = Date.now();
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => (Date.now() - startTime) / 1000,
    });

    // Simulate play
    act(() => {
      video.dispatchEvent(new Event('play'));
    });

    // Advance time by 6 seconds
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Unmount component
    act(() => {
      unmount();
    });

    // Should have sent beacon with remaining 6 seconds
    expect(api.recordPageView).toHaveBeenCalledTimes(1);
    expect(api.recordPageView).toHaveBeenCalledWith(
      expect.objectContaining({
        view_session: viewId,
        page_number: 1,
        duration_seconds: 6,
        video_start_time: 0,
        video_end_time: 6,
      }),
      false
    );
  });

  it('triggers download anchor click on download button click', () => {
    const downloadUrl = 'http://example.com/download?dataroom_document_id=doc_123';
    render(
      <VideoViewer 
        videoUrl={videoUrl} 
        viewId={viewId} 
        allowDownload={true} 
        downloadUrl={downloadUrl} 
      />
    );

    const mockClick = vi.fn();
    const originalCreateElement = document.createElement;
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement.call(document, tagName);
      if (tagName === 'a') {
        el.click = mockClick;
      }
      return el;
    });

    const downloadBtn = screen.getByTitle('Download video');
    act(() => {
      downloadBtn.click();
    });

    expect(mockClick).toHaveBeenCalled();

    document.createElement.mockRestore();
  });

  it('exposes seekBy via ref to adjust currentTime', () => {
    const ref = { current: null };
    const { container } = render(
      <VideoViewer ref={ref} videoUrl={videoUrl} viewId={viewId} />
    );

    const video = container.querySelector('video');
    Object.defineProperty(video, 'currentTime', {
      value: 10,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(video, 'duration', {
      value: 100,
      writable: true,
      configurable: true,
    });

    act(() => {
      ref.current.seekBy(5);
    });
    expect(video.currentTime).toBe(15);

    act(() => {
      ref.current.seekBy(-10);
    });
    expect(video.currentTime).toBe(5);
  });
});
