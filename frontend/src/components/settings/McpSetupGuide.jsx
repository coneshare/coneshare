import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Check, ExternalLink, ShieldAlert, Terminal, FileCode, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";

export function McpSetupGuide({ rawKey = null }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("claude_desktop");
  const [mode, setMode] = useState("cli"); // "cli" or "json"
  const [copied, setCopied] = useState(false);

  const activeKey = rawKey || "cs_live_YOUR_KEY_HERE";

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://app.coneshare.com";
  const mcpUrl = `${origin}/mcp/sse`;

  const copyToClipboard = (text) => {
    if (!navigator.clipboard) {
      toast.error(t("settings.settingsUpdateFailed"));
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        toast.success(t("common.success"));
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Clipboard copy failed:", err);
        toast.error(t("settings.settingsUpdateFailed"));
      });
  };

  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        coneshare: {
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${activeKey}`,
          },
        },
      },
    },
    null,
    2
  );

  const getCliCommand = (clientId) => {
    if (clientId === "claude_code") {
      return `claude mcp add --transport sse coneshare ${mcpUrl} --header "Authorization: Bearer ${activeKey}"`;
    }
    return `${clientId} mcp add coneshare --url ${mcpUrl} --header "Authorization: Bearer ${activeKey}"`;
  };

  const agentTabs = [
    {
      id: "claude_desktop",
      label: t("settings.mcpTabClaudeDesktop", "Claude Desktop"),
      hasCli: false,
      path: "macOS: ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json",
    },
    {
      id: "claude_code",
      label: t("settings.mcpTabClaudeCode", "Claude Code"),
      hasCli: true,
      cliCmd: getCliCommand("claude_code"),
      path: "~/.claude.json or project .mcp.json",
    },
    {
      id: "agy",
      label: t("settings.mcpTabAgy", "Antigravity CLI (agy)"),
      hasCli: false,
      path: "~/.gemini/config/mcp_config.json or .agents/mcp_config.json",
    },
    {
      id: "cursor",
      label: t("settings.mcpTabCursor", "Cursor"),
      hasCli: false,
      path: "~/.cursor/mcp.json or project .cursor/mcp.json",
    },
    {
      id: "vscode",
      label: t("settings.mcpTabVsCode", "VS Code"),
      hasCli: false,
      path: ".vscode/mcp.json",
    },
    {
      id: "codex",
      label: t("settings.mcpTabCodex", "Codex"),
      hasCli: false,
      path: "~/.codex/config.json or codex.json",
    },
  ];

  const currentAgent = agentTabs.find((a) => a.id === activeTab) || agentTabs[0];
  const isCliActive = currentAgent.hasCli && mode === "cli";
  const displayContent = isCliActive ? currentAgent.cliCmd : jsonConfig;

  return (
    <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
      <p className="pt-1 text-gray-600 dark:text-gray-400">
        {t("settings.mcpSetupGuideSubtitle", "Select your AI tool below to get pre-configured settings to connect to the Remote MCP Server.")}
      </p>

      {/* Agent Selector Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
        {agentTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setCopied(false);
              if (!tab.hasCli) setMode("json");
            }}
            className={`px-3 py-1.5 rounded-md font-medium text-xs transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-gray-100 dark:bg-gray-750 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mode Switcher (CLI vs JSON) for CLI-supported agents */}
      {currentAgent.hasCli && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-gray-500 font-medium">{t("settings.mcpConfigMode", "Configuration Mode")}:</span>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setMode("cli");
                setCopied(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === "cli"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              {t("settings.mcpModeCli", "1-Line CLI Command")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("json");
                setCopied(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === "json"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              {t("settings.mcpModeJson", "JSON File Config")}
            </button>
          </div>
        </div>
      )}

      {/* Target Path / Info Line */}
      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
        <span className="font-semibold">{t("settings.mcpConfigLocation", "Target File / Location")}:</span>{" "}
        {currentAgent.path}
      </div>

      {/* Code Snippet Box */}
      <div className="relative group">
        <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg font-mono text-xs overflow-x-auto border border-gray-800 leading-relaxed">
          {displayContent}
        </pre>
        <Button
          size="sm"
          variant="outline"
          aria-label={t("common.copy", "Copy configuration")}
          onClick={() => copyToClipboard(displayContent)}
          className="absolute top-2 right-2 bg-gray-800/90 text-gray-200 border-gray-700 hover:bg-gray-700 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Permissions Tier Warning */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-lg border border-amber-200 dark:border-amber-800 text-xs">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {t(
            "settings.mcpTierTip",
            "Permissions Tip: Make sure your API key has Read & Write or Full Access if your AI agent needs to upload files or generate share links."
          )}
        </span>
      </div>

      {/* Skill Integration & External Docs Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        <div className="flex items-center gap-1 text-primary font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          <span>
            {t("settings.mcpSkillInstall", "Install the coneshare-it skill for automated uploading, link sharing, and dataroom workflows.")}
          </span>
        </div>
        <a
          href="https://docs.coneshare.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline text-blue-600 dark:text-blue-400 font-medium shrink-0"
        >
          {t("settings.mcpNeedHelp", "Need help? Read the full setup documentation")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
