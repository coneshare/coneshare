import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  ASSET_CACHE_CONTROL,
  HTML_CACHE_CONTROL,
  IMMUTABLE_CACHE_CONTROL,
  buildSignedListHeaders,
  buildSignedPutHeaders,
  buildUploadPlan,
  collectStaticFiles,
  encodeS3Path,
  getCacheControl,
  getContentType,
  md5Hex,
  parseListObjectsV2Xml,
  uploadNextStaticToR2,
} from '../../scripts/upload-next-static-r2.mjs';

const TEST_ENV = {
  NEXT_PUBLIC_ASSET_PREFIX: 'https://assets.coneshare.com',
  R2_ENDPOINT: 'https://account123.r2.cloudflarestorage.com',
  R2_BUCKET_NAME: 'coneshare-assets',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
};

function makeListXml(entries = [], { isTruncated = false, nextContinuationToken = '' } = {}) {
  const contents = entries
    .map(
      ({ key, etag }) =>
        `<Contents><Key>${key}</Key><ETag>&quot;${etag}&quot;</ETag></Contents>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>${isTruncated}</IsTruncated>${
    nextContinuationToken
      ? `<NextContinuationToken>${nextContinuationToken}</NextContinuationToken>`
      : ''
  }${contents}</ListBucketResult>`;
}

function createSampleExportDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-r2-test-'));
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
  return tmpDir;
}

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

  it('builds valid AWS SigV4 PUT and ListObjectsV2 headers for R2', () => {
    const fixedDate = new Date('2026-11-22T03:00:00.000Z');
    const putResult = buildSignedPutHeaders({
      endpointUrl: 'https://account123.r2.cloudflarestorage.com/',
      bucketName: 'coneshare-assets',
      objectKey: '_next/static/chunks/app.js',
      body: Buffer.from('console.log(1);'),
      contentType: 'application/javascript; charset=utf-8',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      now: fixedDate,
    });

    expect(putResult.url).toBe(
      'https://account123.r2.cloudflarestorage.com/coneshare-assets/_next/static/chunks/app.js'
    );
    expect(putResult.headers['x-amz-date']).toBe('20261122T030000Z');
    expect(putResult.headers['Cache-Control']).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(putResult.headers['Content-Type']).toBe('application/javascript; charset=utf-8');
    expect(putResult.headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-access-key\/20261122\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
    );

    const listResult = buildSignedListHeaders({
      endpointUrl: 'https://account123.r2.cloudflarestorage.com/',
      bucketName: 'coneshare-assets',
      prefix: 'site/',
      continuationToken: 'tok+1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      now: fixedDate,
    });

    expect(listResult.url).toBe(
      'https://account123.r2.cloudflarestorage.com/coneshare-assets?continuation-token=tok%2B1&list-type=2&prefix=site%2F'
    );
    expect(listResult.headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('parses paginated ListObjectsV2 XML and skips multipart ETags cleanly', () => {
    const parsed = parseListObjectsV2Xml(
      `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;1</NextContinuationToken><Contents><Key>site/a&amp;b.html</Key><ETag>&quot;0123456789abcdef0123456789abcdef&quot;</ETag></Contents><Contents><Key>big.mp4</Key><ETag>"0123456789abcdef0123456789abcdef-2"</ETag></Contents></ListBucketResult>`
    );

    expect(parsed.isTruncated).toBe(true);
    expect(parsed.nextContinuationToken).toBe('next&1');
    expect(parsed.objects.get('site/a&b.html')).toBe('0123456789abcdef0123456789abcdef');
    expect(parsed.objects.has('big.mp4')).toBe(false);
  });

  it('skips cleanly when neither NEXT_PUBLIC_ASSET_PREFIX nor R2 credentials are set', async () => {
    const logger = { log: vi.fn() };
    const result = await uploadNextStaticToR2({ env: {}, logger });
    expect(result).toEqual({ skipped: true, uploaded: 0, unchanged: 0 });
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
    const tmpDir = createSampleExportDir();
    try {
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

      const mockFetch = vi.fn(async (_url, init) => {
        if (init.method === 'GET') {
          return { ok: true, status: 200, text: async () => makeListXml([]) };
        }
        return { ok: true, status: 200 };
      });
      const logger = { log: vi.fn() };

      const result = await uploadNextStaticToR2({
        cwd: tmpDir,
        fetchImpl: mockFetch,
        sleepImpl: async () => {},
        logger,
        env: TEST_ENV,
      });

      expect(result).toEqual({ skipped: false, uploaded: 4, unchanged: 0 });

      const putCallsByUrl = new Map(
        mockFetch.mock.calls
          .filter(([, init]) => init.method === 'PUT')
          .map(([url, init]) => [url, init.headers])
      );
      expect(putCallsByUrl.size).toBe(4);
      expect(
        putCallsByUrl.get(
          'https://account123.r2.cloudflarestorage.com/coneshare-assets/_next/static/chunks/main.js'
        )['Cache-Control']
      ).toBe(IMMUTABLE_CACHE_CONTROL);
      expect(
        putCallsByUrl.get(
          'https://account123.r2.cloudflarestorage.com/coneshare-assets/site/index.html'
        )['Cache-Control']
      ).toBe(HTML_CACHE_CONTROL);
      expect(
        putCallsByUrl.get(
          'https://account123.r2.cloudflarestorage.com/coneshare-assets/site/screenshots/viewer.png'
        )['Cache-Control']
      ).toBe(ASSET_CACHE_CONTROL);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips unchanged files using paginated ETag diff and supports FORCE_R2_UPLOAD override', async () => {
    const tmpDir = createSampleExportDir();
    try {
      const pngEtag = md5Hex(Buffer.from('png-bytes'));
      const jsEtag = md5Hex(Buffer.from('console.log("ok")'));

      const mockFetch = vi.fn(async (url, init) => {
        if (init.method === 'GET') {
          if (url.includes('prefix=_next%2Fstatic%2F')) {
            return {
              ok: true,
              status: 200,
              text: async () => makeListXml([{ key: '_next/static/chunks/main.js', etag: jsEtag }]),
            };
          }
          if (url.includes('continuation-token=page2')) {
            return {
              ok: true,
              status: 200,
              text: async () =>
                makeListXml([{ key: 'site/index.html', etag: '00000000000000000000000000000000' }]),
            };
          }
          return {
            ok: true,
            status: 200,
            text: async () =>
              makeListXml([{ key: 'site/screenshots/viewer.png', etag: pngEtag }], {
                isTruncated: true,
                nextContinuationToken: 'page2',
              }),
          };
        }
        return { ok: true, status: 200 };
      });

      const incrementalResult = await uploadNextStaticToR2({
        cwd: tmpDir,
        fetchImpl: mockFetch,
        sleepImpl: async () => {},
        logger: { log: vi.fn() },
        env: TEST_ENV,
      });

      expect(incrementalResult).toEqual({ skipped: false, uploaded: 2, unchanged: 2 });
      const uploadedUrls = mockFetch.mock.calls
        .filter(([, init]) => init.method === 'PUT')
        .map(([url]) => url);
      expect(uploadedUrls.some((u) => u.endsWith('screenshots/viewer.png'))).toBe(false);
      expect(uploadedUrls.some((u) => u.endsWith('chunks/main.js'))).toBe(false);
      expect(uploadedUrls.some((u) => u.endsWith('site/index.html'))).toBe(true);
      expect(uploadedUrls.some((u) => u.endsWith('media/font.woff2'))).toBe(true);

      mockFetch.mockClear();
      const forcedResult = await uploadNextStaticToR2({
        cwd: tmpDir,
        fetchImpl: mockFetch,
        sleepImpl: async () => {},
        logger: { log: vi.fn() },
        env: { ...TEST_ENV, FORCE_R2_UPLOAD: 'true' },
      });
      expect(forcedResult).toEqual({ skipped: false, uploaded: 4, unchanged: 0 });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('retries transient HTTP 500/429 and falls back to full upload if listing returns 403', async () => {
    const tmpDir = createSampleExportDir();
    try {
      let screenshotAttempts = 0;
      const sleepCalls = [];

      const mockFetch = vi.fn(async (url, init) => {
        if (init.method === 'GET') {
          return { ok: false, status: 403, text: async () => 'AccessDenied' };
        }
        if (url.endsWith('viewer.png')) {
          screenshotAttempts += 1;
          if (screenshotAttempts === 1) {
            return { ok: false, status: 500, text: async () => '<Code>InternalError</Code>' };
          }
          if (screenshotAttempts === 2) {
            return { ok: false, status: 429, text: async () => 'SlowDown' };
          }
        }
        return { ok: true, status: 200 };
      });

      const result = await uploadNextStaticToR2({
        cwd: tmpDir,
        fetchImpl: mockFetch,
        retryDelaysMs: [10, 20, 30],
        sleepImpl: async (ms) => {
          sleepCalls.push(ms);
        },
        logger: { log: vi.fn() },
        env: TEST_ENV,
      });

      expect(result).toEqual({ skipped: false, uploaded: 4, unchanged: 0 });
      expect(screenshotAttempts).toBe(3);
      expect(sleepCalls).toEqual([10, 20]);

      const nonRetryableFetch = vi.fn(async (_url, init) => {
        if (init.method === 'GET') {
          return { ok: true, status: 200, text: async () => makeListXml([]) };
        }
        return { ok: false, status: 403, text: async () => 'InvalidAccessKeyId' };
      });

      await expect(
        uploadNextStaticToR2({
          cwd: tmpDir,
          fetchImpl: nonRetryableFetch,
          concurrency: 1,
          retryDelaysMs: [10, 20],
          sleepImpl: async () => {},
          logger: { log: vi.fn() },
          env: TEST_ENV,
        })
      ).rejects.toThrow(/HTTP 403 InvalidAccessKeyId/);

      const putCalls = nonRetryableFetch.mock.calls.filter(([, init]) => init.method === 'PUT');
      expect(putCalls).toHaveLength(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
