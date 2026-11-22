import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONTENT_TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
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
};

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const DEFAULT_CONCURRENCY = 8;
const R2_REGION = 'auto';
const S3_SERVICE = 's3';

export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
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

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function formatAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function buildSignedPutHeaders({
  endpointUrl,
  bucketName,
  objectKey,
  body,
  contentType,
  accessKeyId,
  secretAccessKey,
  now = new Date(),
}) {
  const parsed = new URL(endpointUrl);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${encodeS3Path(`${bucketName}/${objectKey}`)}`;

  const canonicalHeaders =
    `host:${parsed.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
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
    url: `${parsed.origin}${canonicalUri}`,
    headers: {
      Authorization: authorization,
      'Cache-Control': IMMUTABLE_CACHE_CONTROL,
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  };
}

export function collectStaticFiles(rootDir, baseDir = rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectStaticFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      files.push({ fullPath, relativePath });
    }
  }

  return files;
}

export async function uploadNextStaticToR2({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = fetch,
  concurrency = DEFAULT_CONCURRENCY,
  logger = console,
} = {}) {
  const assetPrefix = (env.NEXT_PUBLIC_ASSET_PREFIX || '').trim();
  const endpointUrl = (env.R2_ENDPOINT || '').trim();
  const bucketName = (env.R2_BUCKET_NAME || '').trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || '').trim();

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
    return { skipped: true, uploaded: 0 };
  }

  const staticDir = path.join(cwd, 'out', '_next', 'static');
  const files = collectStaticFiles(staticDir);

  if (files.length === 0) {
    throw new Error(`No static files found to upload under ${staticDir}`);
  }

  let cursor = 0;
  let uploadedCount = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const { fullPath, relativePath } = files[index];
      const objectKey = `_next/static/${relativePath}`;
      const body = fs.readFileSync(fullPath);
      const contentType = getContentType(fullPath);

      const { url, headers } = buildSignedPutHeaders({
        endpointUrl,
        bucketName,
        objectKey,
        body,
        contentType,
        accessKeyId,
        secretAccessKey,
      });

      const response = await fetchImpl(url, {
        method: 'PUT',
        headers,
        body,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Failed uploading ${objectKey}: HTTP ${response.status} ${errorText}`);
      }

      uploadedCount += 1;
    }
  }

  const workerCount = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  logger.log(`Uploaded ${uploadedCount} _next/static files to R2 bucket "${bucketName}".`);
  return { skipped: false, uploaded: uploadedCount };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  uploadNextStaticToR2().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
