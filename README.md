![Coneshare logo](https://raw.githubusercontent.com/coneshare/coneshare/refs/heads/main/coneshare_logo.png)

[![Backend CI](https://github.com/coneshare/coneshare/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/coneshare/coneshare/actions/workflows/backend-ci.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/coneshare/coneshare)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-coneshare-blue)](https://docs.coneshare.com/en/)

# Coneshare

**Turn your cloud storage into a secure, trackable data room.**

Coneshare is an open-source, self-hosted platform that adds **control, visibility, and workflow automation** on top of your existing storage (Nextcloud, Google Drive, Dropbox).

Share documents securely, track engagement in real time, and trigger actions—without moving your files.

[Quick Start](https://github.com/coneshare/coneshare-compose) · [Docs](https://docs.coneshare.com/en/) · [Live Demo](https://www.coneshare.com/demo) · [Roadmap](https://github.com/orgs/coneshare/projects/2/) · [Forum](https://github.com/orgs/coneshare/discussions)

⭐ If this project is useful, please star the repo.

![Coneshare 30s product walkthrough](https://github.com/coneshare/coneshare/releases/download/v1.2.0/overview-30s.gif)

---

## How It Works

Coneshare acts as a **layer on top of your storage**:

- Files stay in your storage (Nextcloud, Google Drive, Dropbox)
- Coneshare adds:
  - Secure sharing controls
  - Document engagement tracking
  - Workflow automation

No migration. No duplication. No vendor lock-in.

> Instead of asking “Did they read it?”, you’ll know exactly how your documents are used.

---

## Why Coneshare

### 🔐 Control Layer
Add secure sharing on top of your storage:
- Password protection, expiration, email verification
- Download restrictions and dynamic watermarking

### 👁️ Intelligence Layer
Understand how documents are used:
- Views, revisits, downloads
- Page-level engagement insights

### ⚡ Action Layer
Turn activity into workflows:
- Slack and webhook integrations
- Real-time notifications and automation

### 🧱 Built for your infrastructure
- Self-hosted by design
- Works with your existing storage
- No migration required

---

## Integrations

Coneshare works with your existing storage:

- Nextcloud (self-hosted)
- Google Drive
- Dropbox

More integrations coming soon.

---

## Common Use Cases

### 📊 Fundraising / Investor Updates
Know when investors view your deck or data room—and follow up at the right moment.

### 💼 Sales & Deal Workflows
Track proposal engagement and prioritize high-intent prospects.

### 🤝 Secure External Sharing
Share sensitive documents with full control and visibility.

### 🏛️ Compliance & Regulated Environments
Run fully self-hosted while maintaining modern sharing workflows.

---

## Who Is Coneshare For?

Coneshare is built for teams who:

- Use cloud or self-hosted storage (Nextcloud, Drive, Dropbox)
- Share sensitive documents externally
- Need visibility into document engagement
- Prefer self-hosted or private infrastructure

---

## What’s New in v1.2

- Activity-based workflow automation from document and data room events
- Slack and webhook integrations for real-time team awareness
- Delivery logs with retry and replay for reliable event handling
- Multi-destination delivery for parallel team/system updates

---

## Quick Start (build from source)

Run Coneshare locally and connect it to your storage:

```bash
git clone git@github.com:coneshare/coneshare.git
cd coneshare
cp .env.template .env
make build
make up
make migrate
````

Then open:

* Frontend: [http://localhost:5173](http://localhost:5173)
* API: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)

For production setup:

* **[https://github.com/coneshare/coneshare-compose](https://github.com/coneshare/coneshare-compose)**

---

## Architecture

![Coneshare architecture diagram](./docs/assets/readme/architecture-v1.2.png)

Coneshare is a multi-service stack:

* `backend/`: Django + DRF API, Celery, Redis-based async tasks
* `core/`: Go file service for secure file I/O
* `frontend/`: React + Vite web app
* `docs/`: Product and architecture documentation

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
