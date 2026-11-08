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
    });

    it('links virtual dataroom to /zh/virtual-dataroom on zh path', () => {
      mockPathname = '/zh';
      render(<Header />);

      const vdrLinks = screen.getAllByRole('link', { name: /虚拟资料室/i });
      expect(vdrLinks.some((link) => link.getAttribute('href') === '/zh/virtual-dataroom')).toBe(true);
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
    });

    it('falls back to /zh when on an untranslated English route', () => {
      mockPathname = '/blog';
      render(<Footer />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh');

      cleanup();
      mockPathname = '/features/dynamic-watermarking';
      render(<Footer />);
      expect(screen.getByRole('link', { name: '中文' })).toHaveAttribute('href', '/zh');
    });
  });

  describe('portal/lib/i18n Module', () => {
    it('defines supported subpaths and all routes correctly', () => {
      expect(ZH_SUPPORTED_SUBPATHS).toEqual(['/about', '/virtual-dataroom']);
      expect(ZH_ALL_ROUTES).toEqual(['/zh', '/zh/about', '/zh/virtual-dataroom']);
    });

    it('correctly maps alternate paths with getAlternateLocalePath', () => {
      // From Chinese to English
      expect(getAlternateLocalePath('/zh', true)).toBe('/');
      expect(getAlternateLocalePath('/zh/', true)).toBe('/');
      expect(getAlternateLocalePath('/zh/about', true)).toBe('/about');
      expect(getAlternateLocalePath('/zh/virtual-dataroom', true)).toBe('/virtual-dataroom');

      // From English to Chinese
      expect(getAlternateLocalePath('/', false)).toBe('/zh');
      expect(getAlternateLocalePath('/about', false)).toBe('/zh/about');
      expect(getAlternateLocalePath('/about/', false)).toBe('/zh/about');
      expect(getAlternateLocalePath('/virtual-dataroom', false)).toBe('/zh/virtual-dataroom');

      // Untranslated paths fallback to /zh
      expect(getAlternateLocalePath('/blog', false)).toBe('/zh');
      expect(getAlternateLocalePath('/solutions/sales', false)).toBe('/zh');
      expect(getAlternateLocalePath('/features/online-document-preview', false)).toBe('/zh');
    });
  });
});
