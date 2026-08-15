# API Keys Page — MCP Agent Setup Instructions

## Problem
Users can create API keys on `/settings/api-keys`, but the page offers no guidance on how to use the key to connect AI agents (Claude Desktop, Claude Code, Antigravity CLI `agy`, Cursor, VS Code, Codex) to the Coneshare MCP server. Users must manually look up docs or guess the config format.

## Goal
Add in-page setup instructions so users can go from "key created" → "AI agent connected" without leaving the settings page.

---

## Design Decisions

### 1. Collapsible "How to connect your AI agent" section
- **Position**: Top of the API Keys settings page, above the key list and creation form.
- **Default state**: Collapsed (non-intrusive for returning users).
- **Content**: Component `<McpSetupGuide />` with a tabbed UI for 6 supported agents.
- **MCP URL derivation**: Always derived from `window.location.origin + '/mcp/sse'` (e.g. `${window.location.origin}/mcp/sse`).
- **API key handling**: 
  - Static guide: Shows placeholder `cs_live_YOUR_KEY_HERE`.
  - Post-creation banner: Dynamically bakes the freshly created raw API key into all config snippets.
- **Copy interaction**: Copy button next to each config block (consistent with existing key copy UX).
- **Permission Tier Tip**: Callout warning explaining that `read_write` or `full_access` scope tiers are required if the AI agent needs to upload files or generate share links.
- **Skill promotion & Docs links**: 
  - Link to `coneshare-it` skill installation (`.agent/skills/coneshare-it/SKILL.md`).
  - Footer link: "Need help? Read the full setup documentation" → `https://docs.coneshare.com`.
- **Spacing & Layout**: Clean container top padding (`pt-4`) when expanded inside the collapsible accordion container, with `pt-1` paragraph spacing for readable visual hierarchy.

### 2. Enhanced post-creation secret banner
- **Current behavior**: Shows raw key + single copy button.
- **New behavior**: Embed `<McpSetupGuide rawKey={createdRawKey} />` directly inside the creation alert banner with pre-filled config snippets using the **actual raw key** (since the raw key is only visible at creation time).
- Same 6 agent tabs, same copy button pattern.

### 3. Supported agents (6 tabs) & Config formats

| Tab | Config format | Target file / CLI command | Notes |
|---|---|---|---|
| Claude Desktop | JSON | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` block |
| Claude Code | CLI / JSON | CLI: `claude mcp add --transport sse coneshare <URL> --header "Authorization: Bearer <KEY>"`<br>JSON: `~/.claude.json` or `.mcp.json` | Single CLI command or JSON `mcpServers` block |
| Antigravity CLI (agy) | JSON | `~/.gemini/config/mcp_config.json` or `.agents/mcp_config.json` | `mcpServers` block |
| Cursor | JSON | `~/.cursor/mcp.json` or project `.cursor/mcp.json` | `mcpServers` block |
| VS Code Copilot | JSON | `.vscode/mcp.json` or VS Code Settings JSON | `mcpServers` block |
| Codex | JSON | `~/.codex/config.json` or `codex.json` | `mcpServers` block |

### 4. Config snippet templates

#### JSON Config Example (Claude Desktop / Antigravity / Cursor / VS Code)
```json
{
  "mcpServers": {
    "coneshare": {
      "url": "https://<SITE_DOMAIN>/mcp/sse",
      "headers": {
        "Authorization": "Bearer cs_live_YOUR_KEY_HERE"
      }
    }
  }
}
```

#### CLI Command Example (Claude Code)
```bash
claude mcp add --transport sse coneshare https://<SITE_DOMAIN>/mcp/sse --header "Authorization: Bearer cs_live_YOUR_KEY_HERE"
```

#### CLI Command Example (Antigravity CLI `agy` / Codex)
```bash
agy mcp add coneshare --url https://<SITE_DOMAIN>/mcp/sse --header "Authorization: Bearer cs_live_YOUR_KEY_HERE"
```

Each agent tab shows:
1. One-line instruction: where to put the config file or terminal CLI command to execute.
2. Toggle for **CLI Command** vs **JSON Config** (for CLI agents).
3. Ready-to-paste JSON/CLI code block.
4. Copy button.

---

## Scope

### In scope (Completed)
- New reusable component [`frontend/src/components/settings/McpSetupGuide.jsx`](../frontend/src/components/settings/McpSetupGuide.jsx).
- Collapsible instructions section on [`frontend/src/pages/ApiKeysSettingsPage.jsx`](../frontend/src/pages/ApiKeysSettingsPage.jsx).
- Tabbed agent selector with 6 agents (Claude Desktop, Claude Code, Antigravity `agy`, Cursor, VS Code, Codex).
- Dynamic MCP URL derivation (`${window.location.origin}/mcp/sse`).
- Copy-to-clipboard for each config/CLI block.
- Enhanced post-creation banner with pre-filled live secret key snippets.
- Permission tier guidance callout.
- i18n support in `frontend/src/locales/en/translation.json`, `zh-hans/translation.json`, and `ru/translation.json`.
- Link to external documentation & `coneshare-it` skill.

### Out of scope
- Backend API changes (no new endpoints needed).
- Real-time connection testing from the frontend UI.
- Automated OS detection (display clear cross-platform path reference notes instead).

---

## Implementation Summary & Status

### Step 1: Create `McpSetupGuide.jsx` Component ✅
- Created [`frontend/src/components/settings/McpSetupGuide.jsx`](../frontend/src/components/settings/McpSetupGuide.jsx).
- Accepts `rawKey` prop (defaults to `"cs_live_YOUR_KEY_HERE"`).
- Implements tab state for 6 agents and mode state (CLI vs JSON) for CLI agents.
- Derives `mcpUrl` dynamically as `${origin}/mcp/sse`.

### Step 2: Add i18n Translation Keys ✅
- Added localized strings for title, description, tabs, file paths, CLI instructions, and tier warnings in:
  - [`frontend/src/locales/en/translation.json`](../frontend/src/locales/en/translation.json)
  - [`frontend/src/locales/zh-hans/translation.json`](../frontend/src/locales/zh-hans/translation.json)
  - [`frontend/src/locales/ru/translation.json`](../frontend/src/locales/ru/translation.json)

### Step 3: Update `ApiKeysSettingsPage.jsx` ✅
- Imported `<McpSetupGuide />` in [`frontend/src/pages/ApiKeysSettingsPage.jsx`](../frontend/src/pages/ApiKeysSettingsPage.jsx).
- Added collapsible accordion `<McpSetupGuide />` above creation form with clean `pt-4` container padding.
- Passed `createdRawKey` into `<McpSetupGuide rawKey={createdRawKey} />` inside the creation alert banner.

### Step 4: Verification & Testing ✅
- Updated unit tests in [`frontend/src/tests/pages/ApiKeysSettingsPage.test.jsx`](../frontend/src/tests/pages/ApiKeysSettingsPage.test.jsx).
- Verified key creation flow, dynamic key substitution in snippets, tab switching, and clipboard copying (`3/3 tests passed`).
- Verified full frontend test suite (`npm run test:whitelist` -> `25 test files passed, 177 tests passed`).

---

## References
- [`docs/features/remote-mcp-server.md`](../docs/features/remote-mcp-server.md) — Production Nginx & remote MCP client configuration
- [`docs/features/api-keys-and-permissions.md`](../docs/features/api-keys-and-permissions.md) — API key format, hashing, and tier permission guards
- [`mcp-server/README.md`](../mcp-server/README.md) — MCP server architecture & CLI integration guide
- [`.agent/skills/coneshare-it/SKILL.md`](../.agent/skills/coneshare-it/SKILL.md) — `coneshare-it` workflow skill specification
