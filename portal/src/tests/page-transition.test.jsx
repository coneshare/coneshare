import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { PageTransition } from '../../components/PageTransition';
import {
  NavigationProgress,
  shouldStartNavigationProgress,
} from '../../components/NavigationProgress';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function mockReducedMotion(matches) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('portal/components/PageTransition', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockReducedMotion(false);
  });

  it('renders static content without entry animation on initial mount', () => {
    const { container } = render(
      <PageTransition className="flex-grow">
        <div>Home</div>
      </PageTransition>
    );

    const main = container.querySelector('main');
    expect(main).toHaveClass('flex-grow');
    expect(main).not.toHaveClass('page-transition-enter');
  });

  it('triggers entry animation class when pathname changes and cleans up on animationend', () => {
    const { container, rerender } = render(
      <PageTransition className="flex-grow">
        <div>Home</div>
      </PageTransition>
    );
    const main = container.querySelector('main');

    mockPathname = '/pricing';
    rerender(
      <PageTransition className="flex-grow">
        <div>Pricing</div>
      </PageTransition>
    );

    expect(main).toHaveClass('page-transition-enter');

    fireEvent.animationEnd(main);
    expect(main).not.toHaveClass('page-transition-enter');
  });

  it('does not re-animate when pathname stays unchanged (e.g. same-page hash jump)', () => {
    const { container, rerender } = render(
      <PageTransition className="flex-grow">
        <div>Post</div>
      </PageTransition>
    );
    const main = container.querySelector('main');

    rerender(
      <PageTransition className="flex-grow">
        <div>Post updated</div>
      </PageTransition>
    );

    expect(main).not.toHaveClass('page-transition-enter');
  });

  it('skips entry animation when prefers-reduced-motion is reduce', () => {
    mockReducedMotion(true);

    const { container, rerender } = render(
      <PageTransition className="flex-grow">
        <div>Home</div>
      </PageTransition>
    );
    const main = container.querySelector('main');

    mockPathname = '/zh/blog';
    rerender(
      <PageTransition className="flex-grow">
        <div>Blog</div>
      </PageTransition>
    );

    expect(main).not.toHaveClass('page-transition-enter');
  });
});

describe('portal/components/NavigationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = '/';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters out external links, new-tab links, and same-page hash links', () => {
    const makeAnchor = (attrs) => {
      const a = document.createElement('a');
      Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
      return a;
    };
    const loc = { href: 'https://www.coneshare.com/zh/blog' };

    expect(shouldStartNavigationProgress(makeAnchor({ href: '/zh/pricing' }), loc)).toBe(true);
    expect(shouldStartNavigationProgress(makeAnchor({ href: '#section-1' }), loc)).toBe(false);
    expect(shouldStartNavigationProgress(makeAnchor({ href: '/zh/blog#section-1' }), loc)).toBe(
      false
    );
    expect(shouldStartNavigationProgress(makeAnchor({ href: '/zh/blog?page=2' }), loc)).toBe(false);
    expect(shouldStartNavigationProgress(makeAnchor({ href: '/zh/blog/' }), loc)).toBe(false);
    expect(
      shouldStartNavigationProgress(makeAnchor({ href: 'https://github.com/coneshare' }), loc)
    ).toBe(false);
    expect(
      shouldStartNavigationProgress(
        makeAnchor({ href: '/zh/pricing', target: '_blank' }),
        loc
      )
    ).toBe(false);
    expect(
      shouldStartNavigationProgress(makeAnchor({ href: '/zh/pricing' }), loc, { metaKey: true })
    ).toBe(false);
  });

  it('starts immediately on internal link click and completes when pathname changes', () => {
    const { getByTestId, getByRole, rerender } = render(
      <>
        <NavigationProgress />
        <a href="/zh/blog">Blog</a>
      </>
    );

    const track = getByTestId('navigation-progress');
    expect(track).toHaveAttribute('data-state', 'idle');

    fireEvent.click(getByRole('link', { name: 'Blog' }));
    expect(track).toHaveAttribute('data-state', 'loading');
    expect(track).toHaveClass('opacity-100');

    mockPathname = '/zh/blog';
    rerender(
      <>
        <NavigationProgress />
        <a href="/zh/blog">Blog</a>
      </>
    );

    expect(track).toHaveAttribute('data-state', 'completing');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(track).toHaveAttribute('data-state', 'idle');
    expect(track).toHaveClass('opacity-0');
  });
});
