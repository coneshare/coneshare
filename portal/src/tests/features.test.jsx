import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { features } from '../../lib/content';
import { FEATURES_ZH } from '../../lib/content-zh';
import { ZH_FEATURE_SLUGS } from '../../lib/i18n';
import {
  FeaturesIndexView,
  FeatureDetailView,
  FileRequestEmbedView,
  buildFeaturesIndexMetadata,
  buildFeatureDetailMetadata,
  buildFileRequestEmbedMetadata,
} from '../../components/FeaturesViews';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ priority, alt = '', ...props }) => <img alt={alt} {...props} />,
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('Bilingual /features & /zh/features Views', () => {
  it('provides Chinese translations for every feature slug in content.js', () => {
    const enSlugs = features.map((f) => f.slug);
    expect(Object.keys(FEATURES_ZH)).toEqual(enSlugs);
    features.forEach((feature) => {
      expect(feature.menuNameZh).toBeTruthy();
      expect(FEATURES_ZH[feature.slug].name).toBeTruthy();
      expect(FEATURES_ZH[feature.slug].description).toBeTruthy();
      expect(ZH_FEATURE_SLUGS.has(feature.slug)).toBe(true);
    });
    expect(ZH_FEATURE_SLUGS.has('file-request-embed')).toBe(true);
  });

  it('builds consistent canonical and zh-CN hreflang metadata for index, detail, and embed pages', () => {
    const zhIndexMeta = buildFeaturesIndexMetadata('zh');
    expect(zhIndexMeta.alternates.canonical).toBe('https://www.coneshare.com/zh/features');
    expect(zhIndexMeta.alternates.languages).toEqual({
      en: 'https://www.coneshare.com/features',
      'zh-CN': 'https://www.coneshare.com/zh/features',
    });

    const zhDetailMeta = buildFeatureDetailMetadata('secure-sharing', 'zh');
    expect(zhDetailMeta.title).toBe('安全文档与资料室分发 | Coneshare');
    expect(zhDetailMeta.alternates.canonical).toBe(
      'https://www.coneshare.com/zh/features/secure-sharing'
    );
    expect(zhDetailMeta.alternates.languages).toEqual({
      en: 'https://www.coneshare.com/features/secure-sharing',
      'zh-CN': 'https://www.coneshare.com/zh/features/secure-sharing',
    });

    const zhEmbedMeta = buildFileRequestEmbedMetadata('zh');
    expect(zhEmbedMeta.alternates.canonical).toBe(
      'https://www.coneshare.com/zh/features/file-request-embed'
    );
    expect(zhEmbedMeta.alternates.languages).toEqual({
      en: 'https://www.coneshare.com/features/file-request-embed',
      'zh-CN': 'https://www.coneshare.com/zh/features/file-request-embed',
    });
  });

  it('renders localized Chinese features index linking to /zh/features/<slug>', () => {
    render(<FeaturesIndexView locale="zh" />);
    expect(
      screen.getByRole('heading', { name: '为你的文档加上安全控制与洞察能力' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '受控安全层' })).toBeInTheDocument();

    const learnMoreLinks = screen.getAllByRole('link', { name: /查看详情/i });
    expect(learnMoreLinks).toHaveLength(features.length);
    expect(learnMoreLinks[0]).toHaveAttribute('href', '/zh/features/secure-sharing');
  });

  it('renders localized Chinese feature details with same-locale related features, pricing CTA, and guide/admin docs CTA', () => {
    const { rerender } = render(<FeatureDetailView slug="dynamic-watermarking" locale="zh" />);
    expect(screen.getByRole('heading', { name: '防拍照动态水印' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '搭配使用的相关功能' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '关联业务场景' })).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /安全文档与资料室分发/i })).toHaveAttribute(
      'href',
      '/zh/features/secure-sharing'
    );
    expect(screen.getByRole('link', { name: /查看方案定价/i })).toHaveAttribute(
      'href',
      '/zh/pricing'
    );
    expect(screen.getByRole('link', { name: /查看使用指南/i })).toHaveAttribute(
      'href',
      '/zh/help/dynamic-watermarking'
    );

    rerender(<FeatureDetailView slug="self-hosted" locale="zh" />);
    expect(
      screen.getByRole('heading', { name: '私有化部署与企业级数据主权' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看运维部署文档/i })).toHaveAttribute(
      'href',
      'https://docs.coneshare.com/en/quick-start/'
    );
  });

  it('renders localized Chinese file-request-embed guide with both user guide and nginx docs links', () => {
    render(<FileRequestEmbedView locale="zh" />);
    expect(
      screen.getByRole('heading', { name: '将安全上传表单直接嵌入自有网站' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /File Request 使用指南/i })).toHaveAttribute(
      'href',
      '/zh/help/file-requests'
    );
    expect(screen.getByRole('link', { name: /Nginx 嵌入配置文档/i })).toHaveAttribute(
      'href',
      'https://docs.coneshare.com/en/file-request-embedding/'
    );
  });

  it('omits redundant format badge/extension headers from online-document-preview cards', () => {
    const { rerender } = render(<FeatureDetailView slug="online-document-preview" locale="zh" />);
    expect(screen.getByRole('heading', { name: 'PDF 文档' })).toBeInTheDocument();
    expect(screen.queryByText('.docx, .pptx')).not.toBeInTheDocument();
    expect(screen.queryByText('DOCX & PPTX')).not.toBeInTheDocument();

    rerender(<FeatureDetailView slug="online-document-preview" locale="en" />);
    expect(screen.getByRole('heading', { name: 'PDF Documents' })).toBeInTheDocument();
    expect(screen.queryByText('.docx, .pptx')).not.toBeInTheDocument();
    expect(screen.queryByText('SPREADSHEET')).not.toBeInTheDocument();
  });
});
