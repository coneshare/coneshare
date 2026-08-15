import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ApiKeysSettingsPage from "../../pages/ApiKeysSettingsPage";
import * as api from "../../services/api";
import "../../i18n";

vi.mock("../../services/api", () => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ApiKeysSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders API keys list correctly", async () => {
    api.getApiKeys.mockImplementation(() =>
      Promise.resolve({
        data: [
          {
            id: "key_1",
            name: "Test MCP Key",
            prefix: "cs_live_abcd",
            tier: "read_only",
            created_at: "2026-07-30T12:00:00Z",
            last_used_at: null,
          },
        ],
      })
    );

    render(
      <MemoryRouter>
        <ApiKeysSettingsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Test MCP Key")).toBeInTheDocument();
      expect(screen.getByText("cs_live_abcd****")).toBeInTheDocument();
    });
  });

  it("toggles the collapsible MCP setup guide", async () => {
    api.getApiKeys.mockImplementation(() => Promise.resolve({ data: [] }));

    render(
      <MemoryRouter>
        <ApiKeysSettingsPage />
      </MemoryRouter>
    );

    const guideToggleBtn = screen.getByRole("button", { name: /How to connect your AI agent to Coneshare MCP/i });
    expect(screen.queryByText(/Select your AI tool below/i)).not.toBeInTheDocument();

    fireEvent.click(guideToggleBtn);
    expect(screen.getByText(/Select your AI tool below/i)).toBeInTheDocument();

    // Click Claude Code tab
    const claudeCodeTab = screen.getByRole("button", { name: /Claude Code/i });
    fireEvent.click(claudeCodeTab);

    // Verify default CLI command string
    expect(screen.getByText(/claude mcp add --transport sse coneshare/i)).toBeInTheDocument();
  });

  it("creates a new API key and displays raw key banner with embedded setup guide", async () => {
    api.getApiKeys.mockImplementation(() => Promise.resolve({ data: [] }));
    api.createApiKey.mockImplementation(() =>
      Promise.resolve({
        data: {
          id: "key_new",
          name: "New Key",
          prefix: "cs_live_1234",
          tier: "read_write",
          raw_key: "cs_live_1234567890abcdef",
        },
      })
    );

    render(
      <MemoryRouter>
        <ApiKeysSettingsPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/Key Name/i);
    fireEvent.change(nameInput, { target: { value: "New Key" } });

    const submitBtn = screen.getByRole("button", { name: /Generate API Key/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createApiKey).toHaveBeenCalledWith({
        name: "New Key",
        tier: "read_only",
        expires_in_days: null,
      });
      expect(screen.getByDisplayValue("cs_live_1234567890abcdef")).toBeInTheDocument();
      // Confirm the live key is embedded in the post-creation setup guide snippet
      expect(screen.getAllByText(/cs_live_1234567890abcdef/i).length).toBeGreaterThan(0);
    });
  });
});
