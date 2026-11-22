import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  ASSET_CACHE_CONTROL,
  HTML_CACHE_CONTROL,
  IMMUTABLE_CACHE_CONTROL,
  buildSignedPutHeaders,
  buildUploadPlan,
  collectStaticFiles,
  encodeS3Path,
  getCacheControl,
  getContentType,
  uploadNextStaticToR2,
} from '../../scripts/upload-next-static-r2.mjs';

describe('portal/scripts/upload-next-static-r2', () => {
  it('resolves accurate content types for Next.js static and HTML assets', () => {
    expect(getContentType('index.html')).toBe('text/html; charset=utf-8');
    expect(getContentType('sitemap.xml')).toBe('application/xml; charset=utf-8');
    expect(getContentType('chunks/app.js')).toBe('application/javascript; charset=utf-8');
    expect(getContentType('chunks/styles.css')).toBe('text/css; charset=utf-8');
    expect(getContentType('media/inter.woff2')).toBe('font/woff2');
    expect(getContentType('media/icon.svg')).toBe('image/svg+xml');
    expect(getContentType('chunks/unknown.bin')).toBe('application/octet-stream');
  });

  it('assigns tiered Cache-Control headers for static chunks, HTML/XML, and public images', () => {
    expect(getCacheControl('_next/static/chunks/main.js')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(getCacheControl('site/_next/static/chunks/main.js')).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(getCacheControl('site/index.html')).toBe(HTML_CACHE_CONTROL);
    expect(getCacheControl('site/zh/blog/rss.xml')).toBe(HTML_CACHE_CONTROL);
    expect(getCacheControl('site/index.txt')).toBe(HTML_CACHE_CONTROL);
    expect(getCacheControl('site/screenshots/feat-vdr-viewer.png')).toBe(ASSET_CACHE_CONTROL);
    expect(getCacheControl('site/logo.svg')).toBe(ASSET_CACHE_CONTROL);
  });

  it('encodes S3 keys cleanly without double-encoding slashes', () => {
    expect(encodeS3Path('my-bucket/_next/static/chunks/main (1).js')).toBe(
      'my-bucket/_next/static/chunks/main%20%281%29.js'
    );
    expect(encodeS3Path('my-bucket/site/zh/__next.$d$slug.txt')).toBe(
      'my-bucket/site/zh/__next.%24d%24slug.txt'
    );
  });

  it('builds valid AWS SigV4 PUT headers and path-style URL for R2', () => {
    const fixedDate = new Date('2026-11-22T03:00:00.000Z');
    const result = buildSignedPutHeaders({
      endpointUrl: 'https://account123.r2.cloudflarestorage.com/',
      bucketName: 'coneshare-assets',
      objectKey: '_next/static/chunks/app.js',
      body: Buffer.from('console.log(1);'),
      contentType: 'application/javascript; charset=utf-8',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      now: fixedDate,
    });

    expect(result.url).toBe(
      'https://account123.r2.cloudflarestorage.com/coneshare-assets/_next/static/chunks/app.js'
    );
    expect(result.headers['x-amz-date']).toBe('20261122T030000Z');
    expect(result.headers['Cache-Control']).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(result.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    expect(result.headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-access-key\/20261122\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );
  });

  it('skips cleanly when neither NEXT_PUBLIC_ASSET_PREFIX nor R2 credentials are set', async () => {
    const logger = { log: vi.fn() };
    const result = await uploadNextStaticToR2({ env: {}, logger });
    expect(result).toEqual({ skipped: true, uploaded: 0 });
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('fails fast when NEXT_PUBLIC_ASSET_PREFIX is set without R2 credentials', async () => {
    await expect(
      uploadNextStaticToR2({
        env: { NEXT_PUBLIC_ASSET_PREFIX: 'https://assets.coneshare.com' },
      })
    ).rejects.toThrow(/required R2 variables are missing/i);
  });

  it('collects and uploads both _next/static/ and site/ exports with appropriate Cache-Control', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-r2-test-'));
    try {
      const chunksDir = path.join(tmpDir, 'out', '_next', 'static', 'chunks');
      const mediaDir = path.join(tmpDir, 'out', '_next', 'static', 'media');
      const screenshotsDir = path.join(tmpDir, 'out', 'screenshots');
      fs.mkdirSync(chunksDir, { recursive: true });
      fs.mkdirSync(mediaDir, { recursive: true });
      fs.mkdirSync(screenshotsDir, { recursive: true });
      fs.writeFileSync(path.join(chunksDir, 'main.js'), 'console.log("ok")');
      fs.writeFileSync(path.join(mediaDir, 'font.woff2'), 'woff2-bytes');
      fs.writeFileSync(path.join(chunksDir, '.DS_Store'), 'junk');
      fs.writeFileSync(path.join(tmpDir, 'out', 'index.html'), '<html></html>');
      fs.writeFileSync(path.join(screenshotsDir, 'viewer.png'), 'png-bytes');

      const collected = collectStaticFiles(path.join(tmpDir, 'out', '_next', 'static'));
      expect(collected.map((item) => item.relativePath).sort()).toEqual([
        'chunks/main.js',
        'media/font.woff2',
      ]);

      const plan = buildUploadPlan(tmpDir, { assetPrefix: 'https://assets.coneshare.com' });
      expect(plan.map((item) => item.objectKey).sort()).toEqual([
        '_next/static/chunks/main.js',
        '_next/static/media/font.woff2',
        'site/index.html',
        'site/screenshots/viewer.png',
      ]);

      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const logger = { log: vi.fn() };

      const result = await uploadNextStaticToR2({
        cwd: tmpDir,
        fetchImpl: mockFetch,
        logger,
        env: {
          NEXT_PUBLIC_ASSET_PREFIX: 'https://assets.coneshare.com',
          R2_ENDPOINT: 'https://account123.r2.cloudflarestorage.com',
          R2_BUCKET_NAME: 'coneshare-assets',
          R2_ACCESS_KEY_ID: 'key',
          R2_SECRET_ACCESS_KEY: 'secret',
        },
      });

      expect(result).toEqual({ skipped: false, uploaded: 4 });
      expect(mockFetch).toHaveBeenCalledTimes(4);

      const callsByUrl = new Map(mockFetch.mock.calls.map(([url, init]) => [url, init.headers]));
      expect(
        callsByUrl.get(
          'https://account123.r2.cloudflarestorage.com/coneshare-assets/_next/static/chunks/main.js'
        )['Cache-Control']
      ).toBe(IMMUTABLE_CACHE_CONTROL);
      expect(
        callsByUrl.get(
          'https://account123.r2.cloudflarestorage.com/coneshare-assets/site/index.html'
        )['Cache-Control']
      ).toBe(HTML_CACHE_CONTROL);
      expect(
        callsByUrl.get(
          'https://account123.r2.cloudflarestorage.com/coneshare-assets/site/screenshots/viewer.png'
        )['Cache-Control']
      ).toBe(ASSET_CACHE_CONTROL);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
