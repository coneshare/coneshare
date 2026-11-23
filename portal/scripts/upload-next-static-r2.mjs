import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const HTML_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
export const ASSET_CACHE_CONTROL = 'public, max-age=86400';

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_RETRY_DELAYS_MS = [500, 1500, 3500];
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const EMPTY_PAYLOAD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const R2_REGION = 'auto';
const S3_SERVICE = 's3';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

export function getCacheControl(objectKey) {
  if (objectKey.startsWith('_next/static/') || objectKey.startsWith('site/_next/static/')) {
    return IMMUTABLE_CACHE_CONTROL;
  }

  const ext = path.extname(objectKey).toLowerCase();
  if (ext === '.html' || ext === '.xml' || ext === '.txt') {
    return HTML_CACHE_CONTROL;
  }

  return ASSET_CACHE_CONTROL;
}

export function encodeRfc3986Segment(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function encodeS3Path(objectPath) {
  return objectPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeRfc3986Segment(segment))
    .join('/');
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function md5Hex(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function formatAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function signS3Request({
  method,
  endpointUrl,
  bucketName,
  objectKey = '',
  query = {},
  extraHeaders = {},
  payloadHash,
  accessKeyId,
  secretAccessKey,
  now = new Date(),
}) {
  const parsed = new URL(endpointUrl);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = objectKey
    ? `/${encodeS3Path(`${bucketName}/${objectKey}`)}`
    : `/${encodeS3Path(bucketName)}`;

  const canonicalQueryString = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [encodeRfc3986Segment(key), encodeRfc3986Segment(String(value))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const canonicalHeaders =
    `host:${parsed.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${R2_REGION}/${S3_SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, R2_REGION);
  const kService = hmac(kRegion, S3_SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmacHex(kSigning, stringToSign);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: canonicalQueryString
      ? `${parsed.origin}${canonicalUri}?${canonicalQueryString}`
      : `${parsed.origin}${canonicalUri}`,
    headers: {
      Authorization: authorization,
      ...extraHeaders,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  };
}

export function buildSignedPutHeaders({
  endpointUrl,
  bucketName,
  objectKey,
  body,
  contentType,
  cacheControl = getCacheControl(objectKey),
  accessKeyId,
  secretAccessKey,
  now = new Date(),
}) {
  return signS3Request({
    method: 'PUT',
    endpointUrl,
    bucketName,
    objectKey,
    extraHeaders: {
      'Cache-Control': cacheControl,
      'Content-Type': contentType,
    },
    payloadHash: sha256Hex(body),
    accessKeyId,
    secretAccessKey,
    now,
  });
}

export function buildSignedListHeaders({
  endpointUrl,
  bucketName,
  prefix = '',
  continuationToken = '',
  accessKeyId,
  secretAccessKey,
  now = new Date(),
}) {
  return signS3Request({
    method: 'GET',
    endpointUrl,
    bucketName,
    query: {
      'continuation-token': continuationToken,
      'list-type': '2',
      prefix,
    },
    payloadHash: EMPTY_PAYLOAD_SHA256,
    accessKeyId,
    secretAccessKey,
    now,
  });
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseListObjectsV2Xml(xmlText) {
  const objects = new Map();
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;

  for (const match of xmlText.matchAll(contentsRegex)) {
    const block = match[1];
    const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
    const etagMatch = block.match(/<ETag>([\s\S]*?)<\/ETag>/);
    if (!keyMatch || !etagMatch) {
      continue;
    }

    const key = decodeXmlEntities(keyMatch[1]);
    const rawEtag = decodeXmlEntities(etagMatch[1]).replace(/^"+|"+$/g, '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(rawEtag)) {
      objects.set(key, rawEtag);
    }
  }

  const truncatedMatch = xmlText.match(/<IsTruncated>(true|false)<\/IsTruncated>/i);
  const tokenMatch = xmlText.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);

  return {
    objects,
    isTruncated: truncatedMatch ? truncatedMatch[1].toLowerCase() === 'true' : false,
    nextContinuationToken: tokenMatch ? decodeXmlEntities(tokenMatch[1]) : '',
  };
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchWithRetry({
  fetchImpl,
  url,
  init,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleepImpl = defaultSleep,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const maxAttempts = retryDelaysMs.length + 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const requestInit =
        typeof AbortSignal?.timeout === 'function' && requestTimeoutMs > 0
          ? { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }
          : init;
      const response = await fetchImpl(url, requestInit);

      if (response.ok) {
        return response;
      }

      const errorText =
        typeof response.text === 'function' ? await response.text().catch(() => '') : '';
      const error = new Error(`HTTP ${response.status}${errorText ? ` ${errorText}` : ''}`);
      error.status = response.status;

      if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      if (typeof error?.status === 'number' && !isRetryableStatus(error.status)) {
        throw error;
      }
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await sleepImpl(retryDelaysMs[attempt - 1]);
  }

  throw lastError;
}

async function listPrefixEtags({
  endpointUrl,
  bucketName,
  prefix,
  accessKeyId,
  secretAccessKey,
  fetchImpl,
  retryDelaysMs,
  sleepImpl,
  requestTimeoutMs,
  etags,
}) {
  let continuationToken = '';

  while (true) {
    const { url, headers } = buildSignedListHeaders({
      endpointUrl,
      bucketName,
      prefix,
      continuationToken,
      accessKeyId,
      secretAccessKey,
    });

    const response = await fetchWithRetry({
      fetchImpl,
      url,
      init: { method: 'GET', headers },
      retryDelaysMs,
      sleepImpl,
      requestTimeoutMs,
    });

    if (typeof response.text !== 'function') {
      throw new Error('Invalid ListObjectsV2 response body');
    }

    const xmlText = await response.text();
    const parsed = parseListObjectsV2Xml(xmlText);
    for (const [key, etag] of parsed.objects.entries()) {
      etags.set(key, etag);
    }

    if (!parsed.isTruncated || !parsed.nextContinuationToken) {
      break;
    }
    continuationToken = parsed.nextContinuationToken;
  }
}

export function collectStaticFiles(rootDir, baseDir = rootDir, { excludeTopDirs = [] } = {}) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const excludedSet = new Set(excludeTopDirs);
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (rootDir === baseDir && excludedSet.has(entry.name)) {
        continue;
      }
      files.push(...collectStaticFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

export function buildUploadPlan(cwd = process.cwd(), { assetPrefix = '' } = {}) {
  const outDir = path.join(cwd, 'out');
  const nextStaticDir = path.join(outDir, '_next', 'static');

  const staticUploads = collectStaticFiles(nextStaticDir).map(({ fullPath, relativePath }) => ({
    fullPath,
    objectKey: `_next/static/${relativePath}`,
  }));

  const siteFiles = collectStaticFiles(outDir, outDir, {
    excludeTopDirs: assetPrefix ? ['_next'] : [],
  }).map(({ fullPath, relativePath }) => ({
    fullPath,
    objectKey: `site/${relativePath}`,
  }));

  return [...staticUploads, ...siteFiles];
}

export async function uploadNextStaticToR2({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = fetch,
  concurrency = DEFAULT_CONCURRENCY,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleepImpl = defaultSleep,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  logger = console,
} = {}) {
  const assetPrefix = (env.NEXT_PUBLIC_ASSET_PREFIX || '').trim();
  const endpointUrl = (env.R2_ENDPOINT || '').trim();
  const bucketName = (env.R2_BUCKET_NAME || '').trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || '').trim();
  const forceUpload = ['1', 'true', 'yes'].includes((env.FORCE_R2_UPLOAD || '').trim().toLowerCase());

  const missingR2Vars = [
    ['R2_ENDPOINT', endpointUrl],
    ['R2_BUCKET_NAME', bucketName],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingR2Vars.length > 0) {
    if (assetPrefix) {
      throw new Error(
        `NEXT_PUBLIC_ASSET_PREFIX is set (${assetPrefix}), but required R2 variables are missing: ${missingR2Vars.join(', ')}`
      );
    }

    logger.log('Skipping R2 upload: NEXT_PUBLIC_ASSET_PREFIX and R2 credentials are not configured.');
    return { skipped: true, uploaded: 0, unchanged: 0 };
  }

  const uploadPlan = buildUploadPlan(cwd, { assetPrefix });

  if (uploadPlan.length === 0) {
    throw new Error(`No export files found to upload under ${path.join(cwd, 'out')}`);
  }

  const remoteEtags = new Map();
  if (!forceUpload) {
    try {
      for (const prefix of ['_next/static/', 'site/']) {
        await listPrefixEtags({
          endpointUrl,
          bucketName,
          prefix,
          accessKeyId,
          secretAccessKey,
          fetchImpl,
          retryDelaysMs,
          sleepImpl,
          requestTimeoutMs,
          etags: remoteEtags,
        });
      }
    } catch (error) {
      remoteEtags.clear();
      logger.log(
        `Warning: could not list existing R2 objects for incremental sync (${error?.message || error}); uploading all files.`
      );
    }
  }

  let cursor = 0;
  let uploadedCount = 0;
  let unchangedCount = 0;

  async function worker() {
    while (cursor < uploadPlan.length) {
      const index = cursor;
      cursor += 1;
      const { fullPath, objectKey } = uploadPlan[index];
      const body = fs.readFileSync(fullPath);

      if (!forceUpload && remoteEtags.size > 0 && remoteEtags.get(objectKey) === md5Hex(body)) {
        unchangedCount += 1;
        continue;
      }

      const contentType = getContentType(fullPath);
      const cacheControl = getCacheControl(objectKey);

      const { url, headers } = buildSignedPutHeaders({
        endpointUrl,
        bucketName,
        objectKey,
        body,
        contentType,
        cacheControl,
        accessKeyId,
        secretAccessKey,
      });

      try {
        await fetchWithRetry({
          fetchImpl,
          url,
          init: {
            method: 'PUT',
            headers,
            body,
          },
          retryDelaysMs,
          sleepImpl,
          requestTimeoutMs,
        });
      } catch (error) {
        throw new Error(`Failed uploading ${objectKey}: ${error?.message || error}`);
      }

      uploadedCount += 1;
    }
  }

  const workerCount = Math.min(concurrency, uploadPlan.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  logger.log(
    `Uploaded ${uploadedCount} portal files to R2 bucket "${bucketName}" (${unchangedCount} unchanged skipped).`
  );
  return { skipped: false, uploaded: uploadedCount, unchanged: unchangedCount };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  uploadNextStaticToR2().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
