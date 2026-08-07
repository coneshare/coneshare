# Skill Development & Distribution Workflow Strategy

## Overview

This document defines the official strategy for developing, testing, packaging, and distributing **AI Agent Skills** (`SKILL.md`) across Coneshare projects, team members, and external integrations.

---

## 1. Software Dev vs. Skill Dev SDLC

Developing AI agent skills follows the same rigor as traditional software development:

```text
TRADITIONAL SOFTWARE SDLC             SKILL DEVELOPMENT SDLC
┌─────────────────────────┐           ┌─────────────────────────┐
│ 1. Local Code (.py/.ts) │  ──────►  │ 1. Local Skill (SKILL)  │
│ 2. Unit & Integration   │  ──────►  │ 2. Agent Eval & Testing │
│ 3. Build & Package      │  ──────►  │ 3. Plugin Manifest      │
│ 4. CI/CD & Production   │  ──────►  │ 4. Git / Plugin Registry│
└─────────────────────────┘           └─────────────────────────┘
```

| Software Engineering Phase | Skill Development Phase | Artifacts & Locations |
|---|---|---|
| **Coding & Architecture** | **Prompting & Workflow Design** | `.agent/skills/<skill-name>/SKILL.md` |
| **Local Unit Testing** | **Interactive Agent Testing** | Trigger validation & argument check |
| **Packaging & Manifest** | **Plugin Manifest** | `plugin.json` semver manifest |
| **Deployment & Distribution** | **Git Repo / Plugin Registry** | Committed Git skills & Plugin marketplace |

---

## 2. The 4-Stage Skill Development Lifecycle

### Stage 1: Local Development (`dev`)
- **Location**: `.agent/skills/<skill-name>/SKILL.md`
- **Description Precision**: Write a sharp, trigger-focused `description` in YAML frontmatter. The LLM relies on this description to load the skill automatically.
- **Modular Structure**: Keep instructions concise in `SKILL.md`. Put complex scripts in `scripts/` and reference implementations in `examples/`.

### Stage 2: Testing & Verification (`test`)
- **Trigger Test**: Verify the LLM automatically calls `view_file` on the skill when asked matching user requests.
- **Compliance Test**: Ensure the LLM strictly follows operational rules without hallucinating arguments or skipping steps.
- **Edge-Case Validation**: Test error paths (network failures, invalid tokens, large payload limits).

### Stage 3: Packaging & Versioning (`build`)
- **Plugin Manifest (`plugin.json`)**: Package related skills, hooks, and subagents together with explicit semver versioning:
  ```json
  {
    "name": "coneshare-plugin",
    "version": "1.0.0",
    "description": "Official Coneshare MCP workflows & skills",
    "skills": [".agent/skills/coneshare-it/SKILL.md"]
  }
  ```

### Stage 4: Distribution (`deploy / publish`)
- **Repository Level (Team Standard)**: Commit `.agent/skills/` directly to Git. Anyone running `git clone` or `git pull` instantly gets the updated skill.
- **Global Machine Level**: Copy to `~/.gemini/antigravity-cli/skills/` for personal use across all local projects.
- **Plugin Registry**: Host a git repository or plugin registry URL for CLI installation (`agy plugin add <url>`).

---

## 3. Core Operational Design Principles for Coneshare Skills

### Principle A: Sensible Defaults + Proactive Notice
All Coneshare agent skills must prioritize **zero-friction execution**:
1. Execute user requests instantly using sensible defaults.
2. Present the result clearly.
3. Offer a **Proactive Notice** for optional security or configuration tweaks (e.g. password protection, watermark, NDA sign-off).

### Principle B: Streamed Presigned Upload Handling
- **All Document Uploads**: Standard 2-step pre-signed URL flow (`request_document_upload` -> HTTP binary stream PUT -> `finalize_document_upload`) to ensure zero Base64 buffer overhead on the MCP server for files of any size.
