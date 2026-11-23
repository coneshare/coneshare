import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import catalog from '../../lib/openapi-public.json';
import {
  buildCodeSnippet,
  filterApiCategories,
  resolveSamplePath,
} from '../../lib/api-reference-utils';
import {
  ApiReferenceView,
  buildApiReferenceMetadata,
} from '../../components/ApiReferenceViews';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('/api-reference & /zh/api-reference', () => {
  it('excludes internal schema, admin, and SPA auth routes from the public catalog', () => {
    const allPaths = catalog.categories.flatMap((c) => c.endpoints.map((ep) => ep.path));
    const allOperations = catalog.categories.flatMap((c) =>
      c.endpoints.map((ep) => `${ep.method} ${ep.path}`)
    );
    expect(allPaths.length).toBeGreaterThan(50);
    expect(allPaths.some((p) => p.startsWith('/api/schema'))).toBe(false);
    expect(allPaths.some((p) => p.startsWith('/api/v1/admin/'))).toBe(false);
    expect(allPaths.some((p) => p.startsWith('/api/v1/token'))).toBe(false);
    expect(allPaths.some((p) => p.startsWith('/api/v1/signup'))).toBe(false);
    expect(allPaths).not.toContain('/api/v1/share-links/{id}/preview/');
    expect(allOperations).not.toContain('POST /api/v1/view-sessions/');
    expect(allOperations).toContain('GET /api/v1/view-sessions/');
    expect(allPaths).toContain('/api/v1/documents/');
    expect(allPaths).toContain('/api/v1/share-links/');
  });

  it('builds valid hreflang metadata and multi-language code snippets', () => {
    const enMeta = buildApiReferenceMetadata('en');
    expect(enMeta.alternates.canonical).toBe('https://www.coneshare.com/api-reference');
    expect(enMeta.alternates.languages).toEqual({
      en: 'https://www.coneshare.com/api-reference',
      'zh-CN': 'https://www.coneshare.com/zh/api-reference',
    });

    const sampleEp = {
      method: 'POST',
      path: '/api/v1/share-links/{id}/',
      tierHint: 'read_write',
      parameters: [{ name: 'id', in: 'path', required: true }],
      sampleRequestBody: { enabled: true },
    };
    expect(resolveSamplePath(sampleEp.path, sampleEp.parameters)).toBe(
      '/api/v1/share-links/550e8400-e29b-41d4-a716-446655440000/'
    );
    expect(buildCodeSnippet(sampleEp, 'https://app.coneshare.com', 'curl')).toContain(
      'Authorization: Bearer cs_live_your_api_key'
    );
    expect(buildCodeSnippet(sampleEp, 'https://app.coneshare.com', 'python')).toContain('True');
    expect(buildCodeSnippet(sampleEp, 'https://app.coneshare.com', 'javascript')).toContain(
      'fetch('
    );
  });

  it('filters endpoints by category/search and renders interactive Chinese/English views', () => {
    const filtered = filterApiCategories(catalog.categories, 'analytics', 'daily-visits');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].endpoints.map((ep) => ep.path)).toEqual(['/api/v1/analytics/daily-visits/']);

    render(<ApiReferenceView locale="zh" />);
    expect(screen.getByRole('heading', { name: 'Coneshare REST API 参考文档' })).toBeInTheDocument();
    expect(screen.queryByText('开发者 API')).not.toBeInTheDocument();
    expect(screen.queryByText(/公开接口数/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /下载 OpenAPI JSON/i })).not.toBeInTheDocument();
    expect(screen.queryByText('身份认证方式')).not.toBeInTheDocument();
    expect(screen.getByText('基础请求地址 (Base URL)')).toBeInTheDocument();
    expect(screen.getByText('API Key 权限分级')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/搜索路径、请求方法或接口说明/i);
    fireEvent.change(searchInput, { target: { value: 'daily-visits' } });
    expect(screen.getByText('/api/v1/analytics/daily-visits/')).toBeInTheDocument();

    const expandBtn = screen.getByRole('button', { name: /\/api\/v1\/analytics\/daily-visits\//i });
    fireEvent.click(expandBtn);
    expect(expandBtn).toHaveAttribute('aria-expanded', 'true');
  });
});
