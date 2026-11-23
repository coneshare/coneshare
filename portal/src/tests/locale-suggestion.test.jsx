import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocaleSuggestionBanner } from '../../components/LocaleSuggestionBanner';
import {
  LOCALE_PREFERENCE_STORAGE_KEY,
  getChineseCounterpartPath,
  isChineseBrowserLocale,
} from '../../lib/i18n';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function mockBrowserNavigator({ languages = ['zh-CN', 'en'], language = 'zh-CN', userAgent = 'Mozilla/5.0' } = {}) {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

describe('LocaleSuggestionBanner & i18n locale detection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockPathname = '/';
    mockBrowserNavigator();
  });

  it('resolves exact 1:1 Chinese counterpart paths and returns null for English-only or zh routes', () => {
    const opts = {
      translatedBlogSlugs: ['dataroom-guide-when-to-use'],
      translatedHelpSlugs: ['getting-started'],
    };

    expect(getChineseCounterpartPath('/', opts)).toBe('/zh');
    expect(getChineseCounterpartPath('/pricing', opts)).toBe('/zh/pricing');
    expect(getChineseCounterpartPath('/demo', opts)).toBe('/zh/demo');
    expect(getChineseCounterpartPath('/features/dynamic-watermarking', opts)).toBe(
      '/zh/features/dynamic-watermarking'
    );
    expect(getChineseCounterpartPath('/blog/dataroom-guide-when-to-use', opts)).toBe(
      '/zh/blog/dataroom-guide-when-to-use'
    );
    expect(getChineseCounterpartPath('/help/getting-started', opts)).toBe(
      '/zh/help/getting-started'
    );

    expect(getChineseCounterpartPath('/zh', opts)).toBeNull();
    expect(getChineseCounterpartPath('/zh/pricing', opts)).toBeNull();
    expect(getChineseCounterpartPath('/solutions', opts)).toBeNull();
    expect(getChineseCounterpartPath('/integrations/nextcloud', opts)).toBeNull();
    expect(getChineseCounterpartPath('/blog/english-only-post', opts)).toBeNull();
    expect(getChineseCounterpartPath('/blog/tag/security', opts)).toBeNull();
  });

  it('detects primary Chinese browser locales accurately', () => {
    expect(isChineseBrowserLocale(['zh-CN', 'en-US'], 'zh-CN')).toBe(true);
    expect(isChineseBrowserLocale(['zh-TW'], 'zh-TW')).toBe(true);
    expect(isChineseBrowserLocale([], 'zh-Hans')).toBe(true);
    expect(isChineseBrowserLocale(['en-US', 'zh-CN'], 'en-US')).toBe(false);
    expect(isChineseBrowserLocale(['en-US'], 'en-US')).toBe(false);
  });

  it('shows compact floating prompt on translatable English pages for Chinese browsers and persists dismissal', async () => {
    render(
      <LocaleSuggestionBanner
        translatedBlogSlugs={['dataroom-guide-when-to-use']}
        translatedHelpSlugs={['getting-started']}
      />
    );

    const switchLink = await screen.findByRole('link', { name: '切换中文' });
    expect(switchLink).toHaveAttribute('href', '/zh');

    fireEvent.click(screen.getByRole('button', { name: '关闭语言切换提示' }));
    expect(screen.queryByRole('region', { name: '中文版本提示' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)).toBe('en');

    // Does not show again once dismissed
    mockPathname = '/pricing';
    render(<LocaleSuggestionBanner />);
    expect(screen.queryByRole('region', { name: '中文版本提示' })).not.toBeInTheDocument();
  });

  it('persists zh preference when switching via the floating prompt and maps deep links 1:1', async () => {
    mockPathname = '/features/secure-sharing';
    render(<LocaleSuggestionBanner />);

    const switchLink = await screen.findByRole('link', { name: '切换中文' });
    expect(switchLink).toHaveAttribute('href', '/zh/features/secure-sharing');

    fireEvent.click(switchLink);
    expect(window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY)).toBe('zh');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '中文版本提示' })).not.toBeInTheDocument();
    });
  });

  it('does not render on English-only routes, Chinese routes, or non-Chinese browsers', () => {
    mockPathname = '/solutions';
    const { rerender } = render(<LocaleSuggestionBanner />);
    expect(screen.queryByRole('region', { name: '中文版本提示' })).not.toBeInTheDocument();

    mockPathname = '/zh';
    rerender(<LocaleSuggestionBanner />);
    expect(screen.queryByRole('region', { name: '中文版本提示' })).not.toBeInTheDocument();

    mockPathname = '/';
    mockBrowserNavigator({ languages: ['en-US'], language: 'en-US' });
    rerender(<LocaleSuggestionBanner />);
    expect(screen.queryByRole('region', { name: '中文版本提示' })).not.toBeInTheDocument();
  });
});
