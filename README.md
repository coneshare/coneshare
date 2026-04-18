![Coneshare logo](https://raw.githubusercontent.com/coneshare/coneshare/refs/heads/main/coneshare_logo.png)

[![Backend CI](https://github.com/coneshare/coneshare/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/coneshare/coneshare/actions/workflows/backend-ci.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/coneshare/coneshare)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-coneshare-blue)](https://docs.coneshare.com/en/)

# Coneshare

**Self-hosted document and dataroom sharing with activity automation.**

Coneshare helps security-conscious teams share sensitive content on their own infrastructure, track engagement in real time, and trigger automated workflows through Slack and webhooks.

[Quick Start](https://github.com/coneshare/coneshare-compose) · [Docs](https://docs.coneshare.com/en/) · [Live Demo](https://www.coneshare.com/demo) · [Roadmap](https://github.com/orgs/coneshare/projects/2/) · [Forum](https://github.com/orgs/coneshare/discussions)

⭐ If this project is useful, please star the repo.

![Coneshare 30s product walkthrough](https://github.com/coneshare/coneshare/releases/download/v1.2.0/overview-30s.gif)


## What Is New in v1.2

- Activity-based workflow automation from document and dataroom events
- Slack and webhook integrations for real-time team awareness
- Delivery logs with retry and replay for reliable event handling
- Multi-destination delivery for parallel team/system updates

## Why Coneshare

- **Self-hosted by design**: Keep files and activity data on your infrastructure.
- **Secure sharing controls**: Passwords, expiration, email verification, download restrictions.
- **Dataroom workflows**: Granular folder/file visibility and secure deal collaboration.
- **Actionable engagement data**: Track views, downloads, and document interaction patterns.
- **Automation-ready**: Connect events to Slack, webhooks, and internal systems.

## Common Use Cases

- **Investor awareness**: Get alerts when a pitch deck or dataroom is opened.
- **Sales follow-up timing**: Trigger actions when proposals are viewed or downloaded.
- **Deal visibility**: Monitor dataroom engagement before key conversations.
- **Regulated workflows**: Run fully self-hosted for stricter security and compliance requirements.

## Quick Start (Development mode)

Fastest path:

```bash
git clone git@github.com:coneshare/coneshare.git
cd coneshare
cp .env.template .env
make build
make up
make migrate
```

Then open:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8000/api/v1/`

Compose-first setup guide (Production mode):

- **[coneshare-compose](https://github.com/coneshare/coneshare-compose)**

## Architecture

![Coneshare architecture diagram](./docs/assets/readme/architecture-v1.2.png)

Coneshare is a multi-service stack:

- `backend/`: Django + DRF API, Celery, Redis-based async tasks
- `core/`: Go file service for secure file I/O
- `frontend/`: React + Vite web app
- `docs/`: Product and architecture documentation

Technical reference:

- [Technology Stack](docs/coneshare-techstack.md)
- [Open API Reference](docs/coneshare-open-api.md)

## Contributing

Contributions are welcome. Open an issue, start a discussion, or submit a pull request.

## Community

- Docs: https://docs.coneshare.com/en/
- Discussions: https://github.com/orgs/coneshare/discussions
- Email: dev@coneshare.com

## License

MIT License. See [LICENSE](LICENSE).

## Security

For security issues, contact [dev@coneshare.com](mailto:dev@coneshare.com).
