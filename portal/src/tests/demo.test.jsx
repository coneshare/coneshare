import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DemoView, buildDemoMetadata } from '../../components/DemoViews';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('/demo & /zh/demo', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('builds localized metadata with canonical and hreflang alternates', () => {
    const enMeta = buildDemoMetadata('en');
    expect(enMeta.title).toBe('Live Demo | Coneshare');
    expect(enMeta.alternates.canonical).toBe('/demo');
    expect(enMeta.alternates.languages).toEqual({
      en: '/demo',
      'zh-CN': '/zh/demo',
    });

    const zhMeta = buildDemoMetadata('zh');
    expect(zhMeta.title).toBe('在线演示 | Coneshare');
    expect(zhMeta.alternates.canonical).toBe('/zh/demo');
    expect(zhMeta.alternates.languages).toEqual({
      en: '/demo',
      'zh-CN': '/zh/demo',
    });
  });

  it('renders English demo credentials and account signup link', async () => {
    render(<DemoView locale="en" />);
    expect(
      screen.getByRole('heading', { name: 'Explore Real-Time Signals in Coneshare' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Live Demo')).not.toBeInTheDocument();
    expect(screen.getByText(/do not upload sensitive files here/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Launch Demo' })).toHaveAttribute(
      'href',
      'https://app.coneshare.com'
    );
    expect(screen.getByRole('link', { name: 'Create your own account' })).toHaveAttribute(
      'href',
      'https://app.coneshare.com/signup'
    );
    expect(screen.queryByRole('link', { name: 'Explore features' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('demo@coneshare.com');
  });

  it('renders Chinese demo page copy without redundant links', async () => {
    render(<DemoView locale="zh" />);
    expect(screen.queryByText('在线演示')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '体验 Coneshare 在线演示' })
    ).toBeInTheDocument();
    expect(screen.getByText(/请勿上传敏感文件；如需使用敏感数据测试，请创建自己的账号体验/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开在线演示' })).toHaveAttribute(
      'href',
      'https://app.coneshare.com'
    );
    expect(screen.getByRole('link', { name: '免费创建独立账号' })).toHaveAttribute(
      'href',
      'https://app.coneshare.com/signup'
    );
    expect(screen.queryByRole('link', { name: '探索核心功能' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /浏览应用场景/ })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制登录密码' }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('demo');
  });
});
