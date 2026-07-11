English | [中文](./README_zh.md)

![Coneshare logo](https://raw.githubusercontent.com/coneshare/coneshare/refs/heads/main/coneshare_logo.png)

[![Build CI](https://github.com/coneshare/coneshare/actions/workflows/build-ci.yml/badge.svg)](https://github.com/coneshare/coneshare/actions/workflows/build-ci.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/coneshare/coneshare)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-coneshare-blue)](https://docs.coneshare.com/en/)

# Coneshare

**Add virtual datarooms, secure sharing, document tracking, and workflow automation on top of your storage (Nextcloud, Google Drive, Dropbox). Self-hosted DocSend and VDR alternative.**

Coneshare is an open-source, self-hosted platform that adds a secure distribution layer to your existing files. Share documents and videos, track engagement in real time, and trigger workflows—while keeping your data in your own infrastructure.

[Quick Start](https://github.com/coneshare/coneshare-compose) · [Docs](https://docs.coneshare.com/en/) · [Live Demo](https://www.coneshare.com/demo) · [Roadmap](https://github.com/orgs/coneshare/projects/2/) · [Forum](https://github.com/orgs/coneshare/discussions)

⭐ If this project is useful, please star the repo.

![Coneshare 30s product walkthrough](https://github.com/coneshare/coneshare/releases/download/v1.2.0/overview-30s.gif)

---

## How It Works

Coneshare acts as a **layer on top of your storage**:

- Files stay in your storage (Nextcloud, Google Drive, Dropbox)
- Coneshare adds:
  - Virtual datarooms and rich media previewing
  - Secure sharing controls
  - Document engagement tracking
  - Workflow automation

Keep your storage workflow. Add secure links, data rooms, tracking, and automation.

> Instead of asking “Did they read it?”, you’ll know exactly how your documents are used.

---

## Why Coneshare

### 🗄️ Virtual Datarooms & Rich Previewing
Transform your storage into a professional, interactive dataroom:
- Seamlessly organize and present documents and rich media.
- Fast rendering for PDFs and secure video streaming.
- Inline viewers for effortless navigation between adjacent items.

### 🔐 Control Layer
Add secure sharing on top of your storage:
- Password protection, expiration, and email verification.
- Download restrictions and dynamic watermarking.

### 👁️ Intelligence Layer
Understand how your content is consumed:
- Track views, revisits, and downloads in real time.
- Gain precise page-level engagement insights and media play metrics.

### ⚡ Action Layer
Turn activity into workflows:
- Slack and webhook integrations.
- Real-time notifications and automation.

### 🧱 Built for your infrastructure
- Self-hosted by design.
- Works with your existing storage.

---

## Integrations

Coneshare works with your existing storage:

- Nextcloud (self-hosted)
- Google Drive
- Dropbox

More integrations coming soon.

---

## Common Use Cases

### 💼 Sales & Deal Workflows
Understand how buyers explore your deal across datarooms and separate real prospects from the noise.

### 🤝 Secure External Sharing
Share sensitive documents externally with stronger access control, clearer visibility, and safer workflow governance.

### 🏛️ Compliance & Regulated Environments
Adopt modern document workflows and dataroom capabilities without losing data sovereignty.

---

## Who Is Coneshare For?

Coneshare is built for teams who:

- Use cloud or self-hosted storage (Nextcloud, Google Drive, Dropbox)
- Share sensitive documents externally
- Need visibility into document engagement
- Prefer self-hosted or private infrastructure

---

## Deployment (Self-Hosted)

For production deployment and daily use, we recommend using our official Docker Compose setup. It includes automated Let's Encrypt SSL, production-ready reverse proxies, and optimized containers.

👉 **[Go to coneshare-compose for deployment instructions](https://github.com/coneshare/coneshare-compose)**

---

## Local Development (Contributors)

If you want to contribute to the Coneshare source code, you can run the development stack locally.

### Source Build

Run Coneshare locally for development and contribution:

```bash
git clone git@github.com:coneshare/coneshare.git
cd coneshare
cp .env.template .env
make build
make up
make migrate
```

### First-Run Verification Checklist

After `make up` and `make migrate`, verify the basics before configuring storage integrations:

- Frontend is reachable at [http://localhost:5173](http://localhost:5173)
- API responds at [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)
- Core services are up (`backend`, `frontend`, `core`, `redis`, `celery`)
- Local files are persisted under the project data/storage volumes configured by `docker-compose.yml`
- Smoke test:
  - Upload one document
  - Create a share link
  - Open that link in a private/incognito window and confirm view access works

### Troubleshooting First Install

- `.env` and `SITE_DOMAIN` mismatch:
  - Confirm `.env` exists (copied from `.env.template`) and `SITE_DOMAIN` matches how you access the app locally.
- Backend cannot reach `core` service:
  - Check service names/ports in `docker-compose.yml` and inspect backend/core logs for connection errors.
- Redis/Celery issues (background jobs not running):
  - Confirm both `redis` and `celery` containers are running; then check Celery worker logs.
- Local storage path/permission issues:
  - Verify mounted storage paths exist and are writable by container processes.
- Where to look first:
  - Run `make logs` from repo root, then focus on `backend`, `core`, and `celery` error lines first.

---

## Architecture

![Coneshare architecture diagram](./docs/assets/readme/architecture-v1.2.png)

Coneshare is a multi-service stack:

* `backend/`: Django + DRF API, Celery, Redis-based async tasks
* `core/`: Go service for high-performance file delivery and media streaming
* `frontend/`: React + Vite web app

Technical reference:

* [Technology Stack](docs/strategy/coneshare-techstack.md)
* [Open API Reference](docs/strategy/coneshare-open-api.md)

---

## Contributing

Contributions are welcome. Open an issue, start a discussion, or submit a pull request.

---

## Community

* Docs: [https://docs.coneshare.com/en/](https://docs.coneshare.com/en/)
* Discussions: [https://github.com/orgs/coneshare/discussions](https://github.com/orgs/coneshare/discussions)
* Email: [dev@coneshare.com](mailto:dev@coneshare.com)

---

## License

MIT License. See [LICENSE](LICENSE).

---

## Security

For security issues, contact [dev@coneshare.com](mailto:dev@coneshare.com).
