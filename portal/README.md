# Coneshare Portal

Static marketing site and bilingual blog for Coneshare (`https://www.coneshare.com`), built with **Next.js App Router (`output: 'export'`)**, **MDX (`@next/mdx` + `remark-gfm`)**, and **Tailwind CSS**.

## Directory Structure

- `app/` — English routes (`/`, `/agents`, `/pricing`, `/virtual-dataroom`, `/blog/**`, `/sitemap.xml`, etc.)
- `app/zh/` — Chinese routes (`/zh`, `/zh/agents`, `/zh/pricing`, `/zh/virtual-dataroom`, `/zh/blog/**`)
- `content/blog/` — English MDX blog posts
- `content/blog/zh/` — Chinese MDX blog posts (matching `<slug>.mdx` filenames)
- `components/` — Shared UI and blog views (`BlogViews.js`, `BlogToc.js`, `Header.js`, `Footer.js`, etc.)
- `lib/` — Content loaders and helpers (`blog.js`, `blog-utils.js`, `rss.js`, `i18n.js`, `content.js`)
- `public/` — Static screenshots, posters, logos, and favicon assets
- `scripts/upload-next-static-r2.mjs` — Zero-dependency S3 SigV4 uploader for syncing `out/_next/static/` and `out/` (`site/`) to Cloudflare R2
- `scripts/cloudfront-url-rewrite.js` — CloudFront Function (Viewer Request) mapping clean URLs (e.g. `/blog`) to `.html` files under `/site/`
- `src/tests/` — Vitest unit test suites

## Development & Testing

From the repository root using Docker:

```bash
# Run portal unit tests (Vitest)
make test.portal

# Run non-interactive Next.js static export into portal/out/
COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T -e CI=true portal npm run build
```

Or locally inside `portal/`:

```bash
npm run dev       # Start local dev server
npm run test:run  # Run Vitest unit tests once
npm run build     # Build static export into portal/out/
```

## Authoring Blog Posts

- **English posts:** place `<slug>.mdx` in `portal/content/blog/` -> served at `/blog/<slug>`.
- **Chinese posts:** place `<slug>.mdx` in `portal/content/blog/zh/` -> served at `/zh/blog/<slug>`.
- Export `metadata` at the top of each `.mdx` file (`title`, `description`, `date`, `category`, `tags`, optional `published: false` for drafts).
- When a published `<slug>.mdx` exists in both locales, `hreflang` alternates (`en`, `zh-CN`) and in-article/footer language switches automatically preserve `<slug>`.

## Deployment (Cloudflare Pages + R2 / CloudFront Assets)

`www.coneshare.com` is deployed via Cloudflare Pages (`portal/` root directory), emitting static HTML/assets into `portal/out/`.

To serve `/_next/static/*` (JS chunks, CSS, and bundled `Inter` `.woff2` fonts) through `https://assets.coneshare.com` (CloudFront + R2):

1. Set the Cloudflare Pages **Build command** to:
   ```bash
   npx next build && node scripts/upload-next-static-r2.mjs
   ```
2. Configure **Production-only** environment variables and secrets in Cloudflare Pages:
   - `NEXT_PUBLIC_ASSET_PREFIX` = `https://assets.coneshare.com`
   - `R2_ENDPOINT` = `https://<account_id>.r2.cloudflarestorage.com`
   - `R2_BUCKET_NAME` = `<r2-bucket-name>`
   - `R2_ACCESS_KEY_ID` *(Secret)*
   - `R2_SECRET_ACCESS_KEY` *(Secret)*

Notes on `scripts/upload-next-static-r2.mjs`:
- Uploads `out/_next/static/**/*` to R2 **before** Cloudflare Pages publishes `out/` so new HTML never references missing chunks.
- Performs paginated `ListObjectsV2` ETag comparison so unchanged files (e.g. screenshots and older hashed assets) are skipped automatically; set `FORCE_R2_UPLOAD=true` to force re-uploading all files.
- Retries transient R2 `408`/`429`/`5xx` and network errors with backoff (`8` concurrent uploads by default), failing fast on non-retryable `4xx` errors.
- Sets `Cache-Control: public, max-age=31536000, immutable` and never deletes previously hashed files.
- Skips automatically when `NEXT_PUBLIC_ASSET_PREFIX` and R2 credentials are unset (local builds and PR previews), and fails fast if `NEXT_PUBLIC_ASSET_PREFIX` is set without R2 credentials.
