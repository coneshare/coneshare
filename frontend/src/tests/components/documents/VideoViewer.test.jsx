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

  it('renders video element with correct attributes and without watermark by default', () => {
    const { container } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} />
    );

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('controlsList', 'nodownload');
    expect(video).toHaveAttribute('disablePictureInPicture');
    
    // Watermark should not be rendered
    const watermark = container.querySelector('[aria-hidden="true"]');
    expect(watermark).not.toBeInTheDocument();
  });

  it('renders watermark overlay when watermarkText is provided', () => {
    const { container } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} watermarkText="CONFIDENTIAL" />
    );

    const watermark = container.querySelector('[aria-hidden="true"]');
    expect(watermark).toBeInTheDocument();
    expect(watermark.style.backgroundImage).toContain('data:image/svg+xml');
    expect(watermark.style.backgroundImage).toContain('CONFIDENTIAL');
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

  it('starts tracking watch duration when play event is fired', () => {
    const { container } = render(
      <VideoViewer videoUrl={videoUrl} viewId={viewId} />
    );
    const video = container.querySelector('video');

    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => false,
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
    act(() => {
      video.dispatchEvent(new Event('pause'));
    });

    // Tracking should not have sent a heartbeat yet since it is < 10 seconds
    expect(api.recordPageView).not.toHaveBeenCalled();
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
      }),
      true
    );
  });
});
