import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { ZH_SUPPORTED_SUBPATHS, ZH_ALL_ROUTES, getAlternateLocalePath } from '../../lib/i18n';

// Mock next/navigation
let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// Mock next/image to render standard img tag
vi.mock('next/image', () => ({
  default: ({ priority, alt = '', ...props }) => <img alt={alt} {...props} />,
}));

describe('Header & Footer Localization', () => {
  describe('Header Component', () => {
    it('renders English navigation items by default on root path', () => {
      mockPathname = '/';
      render(<Header />);

      expect(screen.getAllByText('Virtual Dataroom').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Features').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Blog').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Resources').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Live Demo').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Get Started').length).toBeGreaterThan(0);
    });

    it('renders Chinese navigation and localized resource items when pathname is /zh', () => {
      mockPathname = '/zh';
      render(<Header />);

      expect(screen.getAllByText('虚拟资料室').length).toBeGreaterThan(0);
      expect(screen.getAllByText('功能特性').length).toBeGreaterThan(0);
      expect(screen.getAllByText('博客').length).toBeGreaterThan(0);
      expect(screen.getAllByText('资源').length).toBeGreaterThan(0);
      expect(screen.getAllByText('在线演示').length).toBeGreaterThan(0);
      expect(screen.getAllByText('立即开始').length).toBeGreaterThan(0);

      // Open desktop Resources dropdown
      const resourceBtn = screen.getByRole('button', { name: /资源/i });
      fireEvent.click(resourceBtn);

      // Verify Chinese About and Docs menu links
      const aboutLinks = screen.getAllByRole('link', { name: /关于我们/i });
      expect(aboutLinks.some((link) => link.getAttribute('href') === '/zh/about')).toBe(true);

      const docsLinks = screen.getAllByRole('link', { name: /开发文档/i });
      expect(docsLinks.length).toBeGreaterThan(0);

      const blogLinks = screen.getAllByRole('link', { name: '博客' });
      expect(blogLinks.every((link) => link.getAttribute('href') === '/zh/blog')).toBe(true);
    });

    it('links virtual dataroom to /zh/virtual-dataroom on zh path', () => {
      mockPathname = '/zh';
      render(<Header />);

      const vdrLinks = screen.getAllByRole('link', { name: /虚拟资料室/i });
      expect(vdrLinks.some((link) => link.getAttribute('href') === '/zh/virtual-dataroom')).toBe(true);
    });

    it('overlays mobile menu out of flow with scrolling, single About link, and Escape/outside-click dismiss', () => {
      mockPathname = '/';
      render(
        <div>
          <Header />
          <div data-testid="outside">Outside</div>
        </div>
      );

      const menuBtn = screen.getByRole('button', { name: /Open main menu/i });
      fireEvent.click(menuBtn);

      const mobileMenu = document.getElementById('mobile-menu');
      expect(mobileMenu).toBeInTheDocument();
      expect(mobileMenu).toHaveClass(
        'absolute',
        'inset-x-0',
        'top-full',
        'max-h-[calc(100dvh-4rem)]',
        'overflow-y-auto',
        'overscroll-contain'
      );

      const aboutLinks = Array.from(mobileMenu.querySelectorAll('a')).filter(
        (link) => link.getAttribute('href') === '/about'
      );
      expect(aboutLinks).toHaveLength(1);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(document.getElementById('mobile-menu')).not.toBeInTheDocument();

      fireEvent.click(menuBtn);
      expect(document.getElementById('mobile-menu')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(document.getElementById('mobile-menu')).not.toBeInTheDocument();
    });
  });

  describe('Footer Component', () => {
    it('renders English footer text and links on root path', () => {
      mockPathname = '/';
      render(<Footer />);

      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(screen.getByText('Virtual Dataroom')).toBeInTheDocument();
      expect(screen.getByText('Company')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');

      // Language switcher has link to /zh
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh');
    });

    it('renders Chinese footer text, 资料室 and switches links to /zh on zh path', () => {
      mockPathname = '/zh';
      render(<Footer />);

      expect(screen.getByText('产品')).toBeInTheDocument();
      expect(screen.getAllByText('虚拟资料室 (VDR)').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('公司')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '关于我们' })).toHaveAttribute('href', '/zh/about');
      expect(screen.getByRole('link', { name: '博客' })).toHaveAttribute('href', '/zh/blog');

      // Language switcher has link back to English root /
      expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/');
    });

    it('preserves target page subpath in language switcher for supported pages', () => {
      mockPathname = '/zh/about';
      render(<Footer />);
      expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/about');

      cleanup();
      mockPathname = '/about';
      render(<Footer />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh/about');

      cleanup();
      mockPathname = '/blog';
      render(<Footer />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh/blog');

      cleanup();
      mockPathname = '/zh/blog';
      render(<Footer />);
      expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/blog');
    });

    it('preserves matched blog post slug in language switcher and falls back for untranslated posts', () => {
      mockPathname = '/blog/dataroom-guide-when-to-use';
      render(<Footer translatedBlogSlugs={['dataroom-guide-when-to-use']} />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute(
        'href',
        '/zh/blog/dataroom-guide-when-to-use'
      );

      cleanup();
      mockPathname = '/zh/blog/dataroom-guide-when-to-use';
      render(<Footer translatedBlogSlugs={['dataroom-guide-when-to-use']} />);
      expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute(
        'href',
        '/blog/dataroom-guide-when-to-use'
      );

      cleanup();
      mockPathname = '/blog/some-english-post';
      render(<Footer translatedBlogSlugs={['dataroom-guide-when-to-use']} />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh/blog');

      cleanup();
      mockPathname = '/features/dynamic-watermarking';
      render(<Footer />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh');
    });
  });

  describe('portal/lib/i18n Module', () => {
    it('defines supported subpaths and all routes correctly', () => {
      expect(ZH_SUPPORTED_SUBPATHS).toEqual([
        '/about',
        '/virtual-dataroom',
        '/pricing',
        '/agents',
        '/blog',
      ]);
      expect(ZH_ALL_ROUTES).toEqual([
        '/zh',
        '/zh/about',
        '/zh/virtual-dataroom',
        '/zh/pricing',
        '/zh/agents',
        '/zh/blog',
      ]);
    });

    it('correctly maps alternate paths with getAlternateLocalePath', () => {
      // From Chinese to English
      expect(getAlternateLocalePath('/zh', true)).toBe('/');
      expect(getAlternateLocalePath('/zh/', true)).toBe('/');
      expect(getAlternateLocalePath('/zh/about', true)).toBe('/about');
      expect(getAlternateLocalePath('/zh/virtual-dataroom', true)).toBe('/virtual-dataroom');
      expect(getAlternateLocalePath('/zh/agents', true)).toBe('/agents');
      expect(getAlternateLocalePath('/zh/blog', true)).toBe('/blog');
      expect(getAlternateLocalePath('/zh/blog/some-post', true)).toBe('/blog');
      expect(
        getAlternateLocalePath('/zh/blog/some-post', true, { translatedBlogSlugs: ['some-post'] })
      ).toBe('/blog/some-post');

      // From English to Chinese
      expect(getAlternateLocalePath('/', false)).toBe('/zh');
      expect(getAlternateLocalePath('/about', false)).toBe('/zh/about');
      expect(getAlternateLocalePath('/about/', false)).toBe('/zh/about');
      expect(getAlternateLocalePath('/virtual-dataroom', false)).toBe('/zh/virtual-dataroom');
      expect(getAlternateLocalePath('/agents', false)).toBe('/zh/agents');
      expect(getAlternateLocalePath('/blog', false)).toBe('/zh/blog');
      expect(getAlternateLocalePath('/blog/some-post', false)).toBe('/zh/blog');
      expect(
        getAlternateLocalePath('/blog/some-post', false, { translatedBlogSlugs: ['some-post'] })
      ).toBe('/zh/blog/some-post');

      // Untranslated paths fallback to /zh
      expect(getAlternateLocalePath('/solutions/sales', false)).toBe('/zh');
      expect(getAlternateLocalePath('/features/online-document-preview', false)).toBe('/zh');
    });
  });
});
