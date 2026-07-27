# 🚀 Coneshare CLI & Agent Skills Design Plan

## 1. 📌 Architectural Overview

The **Coneshare CLI** (`@coneshare/cli`) is a lightweight client binary that wraps Coneshare's Django REST Framework (DRF) HTTP API. It enables users, scripts, and AI agents (like Claude Code) to interact with Coneshare directly from the terminal.

Alongside the CLI binary, the package ships an **Agent Skill manifest** (`SKILL.md`) that allows AI tools to automatically discover and invoke CLI commands without manual prompt engineering.

---

## 2. 📍 Package Location & Tech Stack

* **Package Location**: `packages/cli/`
* **Tech Stack**: TypeScript + Node.js + `commander.js` + `axios`
* **NPM Package Name**: `@coneshare/cli` (invoked via `coneshare` or `npx @coneshare/cli`)
* **Config Storage**: `~/.config/coneshare/config.json` (stored with `0600` file permissions)

---

## 3. 🔑 Authentication & Environment Config

* **`coneshare login`**: Accepts `--token cs_live_...` or prompts interactively.
* **`coneshare whoami`**: Prints active token snippet, user identity, and target API URL.
* **`coneshare doctor`**: Validates API connection and token validity.
* **Environment Overrides**:
  * `CONESHARE_API_KEY`: API Key token (e.g., `cs_live_...`).
  * `CONESHARE_API_URL`: Base URL of Coneshare backend (default: `http://localhost:8000/api/v1`).

---

## 4. 🖥️ Command Surface

```bash
# Verify Auth
coneshare doctor
coneshare whoami

# Documents & Uploads
coneshare documents list [--query <str>] [--json]
coneshare documents search <query>
coneshare documents upload <file_path> [--folder <folder_id>]
coneshare documents delete <doc_id>

# Share Links & Security
coneshare links create --document <doc_id> [--password <pwd>] [--expires <days>] [--require-nda]
coneshare links list [--document <doc_id>]

# Virtual Datarooms
coneshare datarooms list
coneshare datarooms create <name>

# Analytics & Engagement
coneshare analytics document <doc_id>
```

---

## 5. 📜 Output Contract (`CONTRACT v1`)

* **Interactive TTY**: Renders clean, colorized ASCII tables for terminal users.
* **Piped / Non-Interactive / `--json`**: Returns a strict, machine-readable JSON envelope:
  ```json
  {
    "ok": true,
    "data": { ... },
    "meta": { "next_cursor": null }
  }
  ```
* **Failure Envelope**:
  ```json
  {
    "ok": false,
    "error": {
      "code": "AUTH_INVALID",
      "message": "API key rejected.",
      "status": 401,
      "retryable": false,
      "hint": "Run `coneshare login` to refresh credentials."
    }
  }
  ```

---

## 6. 🤖 Agent Skill (`SKILL.md`)

Location in package: `packages/cli/skills/coneshare/SKILL.md`.

```markdown
---
name: coneshare
description: Coneshare CLI for uploading documents, creating Virtual Datarooms, generating NDA-gated share links, and checking viewer analytics.
---

# Coneshare Skill

## Usage Guidelines
- Always check `coneshare doctor` first to verify API access.
- Pass `--json` when parsing command output in scripts.

## Workflows
### Share a document as a protected link
1. `coneshare documents upload ./pitch-deck.pdf` -> returns document ID
2. `coneshare links create --document <doc_id> --password "secret"` -> returns public URL

### Check deck viewers
1. `coneshare documents search "Series A"` -> find doc ID
2. `coneshare analytics document <doc_id>` -> view page-by-page read duration
```

---

## 🗓️ Implementation Roadmap

| Step | Deliverables | Target Files |
|---|---|---|
| **Phase 1: DRF API Key Auth** | Add `APIKey` model & `APIKeyAuthentication` DRF class | `backend/core/models.py`, `backend/core/authentication.py` |
| **Phase 2: CLI Scaffold** | Create `@coneshare/cli` with `commander.js` & config loader | `packages/cli/src/index.ts`, `packages/cli/src/config.ts` |
| **Phase 3: Commands Implementation** | Implement document, link, dataroom, and analytics commands | `packages/cli/src/commands/*.ts` |
| **Phase 4: Agent Skill & Tests** | Add `SKILL.md` manifest and integration CLI tests | `packages/cli/skills/coneshare/SKILL.md`, `packages/cli/tests/` |
