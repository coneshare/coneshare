import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentsPage from '../../app/agents/page';
import ZhAgentsPage from '../../app/zh/agents/page';
import { AgentScreenshotsShowcase } from '../../components/AgentScreenshotsShowcase';
import { AgentVideoShowcase } from '../../components/AgentVideoShowcase';
import { McpCodeCard } from '../../components/McpCodeCard';
import { AgentToolCatalog } from '../../components/AgentToolCatalog';
import { AgentsFaq } from '../../components/AgentsFaq';
import {
  AGENT_SCREENSHOTS,
  DEFAULT_AGENT_VIDEO_POSTER,
  DEFAULT_AGENT_VIDEO_URL,
  TOTAL_MCP_TOOLS,
} from '../../lib/agentsData';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));

describe('/agents page & components', () => {
  it('renders simplified hero, screenshot showcase, video walkthrough, and 35 tools', () => {
    render(<AgentsPage />);

    expect(
      screen.getByRole('heading', {
        name: /Connect ChatGPT, Gemini & CLI Agents to Your Data Rooms/i,
      })
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Connect Your AI/i })).toHaveAttribute('href', '#setup');
    expect(screen.getByRole('link', { name: /Watch ChatGPT Demo/i })).toHaveAttribute(
      'href',
      '#video-demo'
    );
    expect(
      screen.getByRole('heading', {
        name: /See ChatGPT \+ ConeShare MCP in action/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: new RegExp(`${TOTAL_MCP_TOOLS} tools across documents, Data Rooms, and links`, 'i'),
      })
    ).toBeInTheDocument();
    expect(TOTAL_MCP_TOOLS).toBe(35);
    expect(screen.queryByText(/Live Agent Execution Simulator/i)).not.toBeInTheDocument();
  });

  it('switches between all 4 real screenshots and opens fullscreen zoom lightbox on click', () => {
    render(<AgentScreenshotsShowcase />);

    expect(AGENT_SCREENSHOTS).toHaveLength(4);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    expect(screen.getByAltText(AGENT_SCREENSHOTS[0].alt)).toHaveAttribute(
      'src',
      '/screenshots/agent-mcp-plugin.png'
    );

    // Click image to enlarge into fullscreen portal dialog
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Enlarge image: ${AGENT_SCREENSHOTS[0].alt}`) }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(document.body.contains(dialog)).toBe(true);

    // Close dialog
    fireEvent.click(screen.getByRole('button', { name: 'Close image preview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Navigate via next button and dots
    fireEvent.click(screen.getByRole('button', { name: 'Next screenshot' }));
    expect(screen.getByAltText(AGENT_SCREENSHOTS[1].alt)).toHaveAttribute(
      'src',
      '/screenshots/agent-oauth-scope.png'
    );

    fireEvent.click(screen.getByRole('button', { name: 'View screenshot 3' }));
    expect(screen.getByAltText(AGENT_SCREENSHOTS[2].alt)).toHaveAttribute(
      'src',
      '/screenshots/agent-get-dataroom.png'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next screenshot' }));
    expect(screen.getByAltText(AGENT_SCREENSHOTS[3].alt)).toHaveAttribute(
      'src',
      '/screenshots/agent-save-converation.png'
    );
  });

  it('renders AgentVideoShowcase with configured video/poster URLs and starts playback on click', () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock,
    });

    const { container } = render(<AgentVideoShowcase />);

    const videoEl = container.querySelector('video');
    expect(DEFAULT_AGENT_VIDEO_URL).toBe('https://assets.coneshare.com/coneshare-ai-mcp-v1.mp4');
    expect(DEFAULT_AGENT_VIDEO_POSTER).toBe('/agent-poster.jpg');
    expect(videoEl).toHaveAttribute('src', DEFAULT_AGENT_VIDEO_URL);
    expect(videoEl).toHaveAttribute('poster', DEFAULT_AGENT_VIDEO_POSTER);

    const playBtn = screen.getByRole('button', {
      name: /Play video: ChatGPT \+ ConeShare MCP Walkthrough/i,
    });
    fireEvent.click(playBtn);

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Play video:/i })).not.toBeInTheDocument();
  });

  it('toggles McpCodeCard between Web AI and CLI & Desktop modes', () => {
    render(<McpCodeCard />);

    expect(screen.getByText('https://app.coneshare.com/mcp/sse')).toBeInTheDocument();

    const cliModeTab = screen.getByRole('tab', { name: /CLI & Desktop/i });
    fireEvent.click(cliModeTab);
    expect(cliModeTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/claude mcp add --transport sse coneshare/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Claude Desktop/i }));
    expect(screen.getByText(/claude_desktop_config\.json/i)).toBeInTheDocument();
  });

  it('filters AgentToolCatalog categories and includes create_text_document & search_dataroom_content', () => {
    render(<AgentToolCatalog />);

    expect(screen.queryByRole('tab', { name: /^All/i })).not.toBeInTheDocument();
    expect(screen.getByText('create_text_document()')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Virtual Datarooms/i }));
    expect(screen.getByText('search_dataroom_content()')).toBeInTheDocument();
    expect(screen.queryByText('create_text_document()')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Share Links/i }));
    expect(screen.getByText('create_share_link()')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Admin/i }));
    expect(screen.getByText('list_login_activities()')).toBeInTheDocument();
  });

  it('expands and collapses FAQ entries interactively', () => {
    render(<AgentsFaq />);

    const firstQuestion = screen.getByRole('button', {
      name: /How do I connect ChatGPT, Gemini, or Claude\.ai\?/i,
    });
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');

    const secondQuestion = screen.getByRole('button', {
      name: /Why save and share AI conversations through ConeShare instead of default chat links\?/i,
    });
    fireEvent.click(secondQuestion);
    expect(secondQuestion).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders localized Chinese /zh/agents page with Chinese copy, tools, and FAQs', () => {
    render(<ZhAgentsPage />);

    expect(
      screen.getByRole('heading', {
        name: /让 ChatGPT、Gemini 和 CLI Agent 直接操作你的资料室/i,
      })
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /连接你的 AI/i })).toHaveAttribute('href', '#setup');
    expect(screen.getByRole('link', { name: /观看演示/i })).toHaveAttribute(
      'href',
      '#video-demo'
    );
    expect(
      screen.getByRole('heading', {
        name: new RegExp(`${TOTAL_MCP_TOOLS} 个可用工具`, 'i'),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /怎么在 ChatGPT、Gemini 或 Claude\.ai 里连接 ConeShare？/i,
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /虚拟资料室/i }));
    expect(screen.getByText('search_dataroom_content()')).toBeInTheDocument();
  });
});
