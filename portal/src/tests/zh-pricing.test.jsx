import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PricingContent } from '../../app/zh/pricing/PricingContent';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('/zh/pricing PricingContent', () => {
  it('renders Community, Pro, and Enterprise tiers without billing toggle or Most Popular badge', () => {
    const { container } = render(<PricingContent />);

    expect(container.querySelector('[style*="radial-gradient"]')).toBeNull();

    expect(screen.getByRole('heading', { name: 'Community' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument();

    expect(screen.queryByText('最受欢迎')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '按月支付' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '按年支付' })).not.toBeInTheDocument();

    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$2,999')).toBeInTheDocument();
    expect(screen.getByText('$9,999')).toBeInTheDocument();
  });

  it('includes enterprise software features and purchase CTA in Pro', () => {
    render(<PricingContent />);

    expect(screen.queryByText(/按年授权/)).not.toBeInTheDocument();
    expect(screen.getByText('不限团队成员与访客席位')).toBeInTheDocument();
    expect(
      screen.queryByText(/包含全部企业级收费功能，不限团队席位与访客数量/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/支持白标：移除 Powered by 标识，自定义品牌色\/favicon 等/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/企业级 SSO 与 AD\/LDAP 目录同步、ADFS 集成/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/跨文档全文搜索（支持内部用户与资料室外部访客检索 PDF、Office 与 Markdown）/)
    ).toBeInTheDocument();
    expect(screen.getByText(/企业合规审计日志与安全事件导出/)).toBeInTheDocument();
    expect(
      screen.getByText(/技术支持：开发团队邮件支持（1 个工作日内回复）/)
    ).toBeInTheDocument();

    const proCard = screen.getByRole('heading', { name: 'Pro' }).closest('div.rounded-2xl');
    expect(within(proCard).queryByText(/Slack/i)).not.toBeInTheDocument();

    const proCta = screen.getByRole('link', { name: /联系购买 Pro/i });
    expect(proCta).toHaveAttribute(
      'href',
      'mailto:dev@coneshare.com?subject=ConeShare%20Pro%20Inquiry'
    );
  });

  it('positions Enterprise for multi-tenancy, HA/air-gapped, 24h Slack SLA, and co-development', () => {
    render(<PricingContent />);

    expect(
      screen.getByText(/多租户架构：支持 Multi-tenancy 多租户与多组织（Multi-Org）隔离管理/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/支持多节点高可用集群部署，或纯内网完全离线隔离（Air-gapped）部署/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/专属 Slack 频道，开发团队 24 小时内优先响应与解决/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/定制化功能开发（Co-development）：通用需求 2-4 周内优先排期上线；专有业务逻辑提供独立私有分支定制维护/)
    ).toBeInTheDocument();
  });

  it('renders Managed BYOC section without Pro license bundled, at $1,999/yr or $199/mo', () => {
    render(<PricingContent />);

    expect(
      screen.getByRole('heading', { name: /Managed BYOC（官方托管私有云）/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('$3,999')).not.toBeInTheDocument();
    expect(screen.queryByText('$450 / 月')).not.toBeInTheDocument();
    expect(screen.getAllByText('$1,999').length).toBeGreaterThan(0);
    expect(screen.getByText('$199 / 月')).toBeInTheDocument();
    expect(screen.getByText('3 个月起订')).toBeInTheDocument();
    const byocCard = screen
      .getByRole('heading', { name: /Managed BYOC（官方托管私有云）/ })
      .closest('div.rounded-2xl');
    expect(within(byocCard).getByText('14 天退款保证')).toBeInTheDocument();
    expect(
      within(byocCard).queryByText(/不含 Pro 授权（可选 \+\$2,999\/年 升级 Pro）/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/只需额外叠加 Pro 授权（\+\$2,999 \/ 年，合计 \$4,998 \/ 年）/)
    ).toBeInTheDocument();

    expect(
      screen.getByText(/官方负责交付部署：域名配置、自动 SSL 证书与日志统一收集/)
    ).toBeInTheDocument();
    expect(screen.getByText(/大文件转码与流媒体播放性能调优/)).toBeInTheDocument();
    expect(
      screen.getByText(/业务低峰期安全升级维护与定期数据库备份验证/)
    ).toBeInTheDocument();
    expect(
      within(byocCard).getByText(
        /运维邮件支持：托管部署、升级与故障 1 个工作日内由开发团队邮件回复/
      )
    ).toBeInTheDocument();

    expect(screen.queryByText(/初始化部署费/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,697/)).not.toBeInTheDocument();
  });

  it('renders Compare Features table with all categories and Community vs Pro differences', () => {
    render(<PricingContent />);

    expect(screen.getByRole('heading', { name: '功能对比' })).toBeInTheDocument();
    expect(
      screen.queryByText(/详细对比 Community 开源版与 Pro 商业版/)
    ).not.toBeInTheDocument();

    const categories = [
      '资料室与文档管理',
      '文档分析与追踪',
      '分享链接设置',
      '支持文件格式',
      '用户与身份管理',
      '安全与审计',
      '品牌定制',
      '技术支持',
    ];
    categories.forEach((cat) => {
      expect(screen.getByText(cat)).toBeInTheDocument();
    });

    const featureTable = screen.getAllByRole('table')[0];
    const tableRows = within(featureTable).getAllByRole('row');
    expect(tableRows[1]).toHaveTextContent('资料室与文档管理');

    expect(screen.queryByText('全文搜索（内部用户）')).not.toBeInTheDocument();
    expect(screen.queryByText('全文搜索（资料室外部访客）')).not.toBeInTheDocument();

    const proOnlyFeatures = [
      '全文检索（PDF / Office / Markdown）',
      '分析数据导出',
      'SSO 与 AD/LDAP 目录同步',
      'SSO 与 ADFS 集成',
      '合规审计日志（Audit Log）',
      '完整白标（移除 Powered by 标识等）',
      '邮件支持',
      '1 个工作日内响应支持',
    ];
    proOnlyFeatures.forEach((feature) => {
      expect(screen.getByLabelText(`Community 不支持 ${feature}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Pro 支持 ${feature}`)).toBeInTheDocument();
    });

    expect(screen.queryByText('Slack 频道支持')).not.toBeInTheDocument();

    const supportCategoryRowIndex = tableRows.findIndex(
      (row) => row.textContent === '技术支持'
    );
    expect(supportCategoryRowIndex).toBeGreaterThan(-1);
    expect(tableRows[supportCategoryRowIndex + 1]).toHaveTextContent(
      'GitHub / 社区论坛支持'
    );
    expect(tableRows[supportCategoryRowIndex + 2]).toHaveTextContent('邮件支持');

    const retentionRowIndex = tableRows.findIndex((row) =>
      row.textContent.includes('分析数据保留时长')
    );
    expect(retentionRowIndex).toBeGreaterThan(-1);
    expect(tableRows[retentionRowIndex + 1]).toHaveTextContent('分析数据导出');

    const sharedFeatures = [
      'SSO 单点登录（基于 Dex）',
      '动态水印',
      '自定义组织 Logo',
      '自定义资料室横幅（Banners）',
      'GitHub / 社区论坛支持',
    ];
    sharedFeatures.forEach((feature) => {
      expect(screen.getByLabelText(`Community 支持 ${feature}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Pro 支持 ${feature}`)).toBeInTheDocument();
    });

    expect(screen.getAllByText('不限（自主保留）')).toHaveLength(2);
  });

  it('renders Paid Support informational block with hourly pricing only and without CTA buttons', () => {
    render(<PricingContent />);

    const supportHeading = screen.getByRole('heading', {
      name: 'Support（付费技术支持）',
    });
    expect(supportHeading).toBeInTheDocument();

    const supportCard = supportHeading.closest('div.rounded-2xl');
    expect(within(supportCard).getByText('$150')).toBeInTheDocument();
    expect(within(supportCard).getByText('/ 小时')).toBeInTheDocument();
    expect(within(supportCard).queryByText('单次付费支持')).not.toBeInTheDocument();
    expect(within(supportCard).queryByText('$5,000')).not.toBeInTheDocument();
    expect(within(supportCard).queryByText('/ 年')).not.toBeInTheDocument();
    expect(within(supportCard).queryByText('$2,000')).not.toBeInTheDocument();
    expect(within(supportCard).queryByText('按月订阅')).not.toBeInTheDocument();
    expect(
      within(supportCard).getByText(/包含 Email \/ Slack \/ Remote Session/)
    ).toBeInTheDocument();
    expect(within(supportCard).queryAllByRole('link')).toHaveLength(0);
    expect(within(supportCard).queryAllByRole('button')).toHaveLength(0);
  });

  it('toggles FAQ items interactively', () => {
    render(<PricingContent />);

    const faqQuestion = screen.getByRole('button', {
      name: /团队应该如何在 Pro、Managed BYOC 与 Enterprise 之间做选择？/,
    });
    expect(screen.queryByText(/所有付费方案均不限团队人数与访客席位/)).not.toBeInTheDocument();

    fireEvent.click(faqQuestion);
    expect(screen.getByText(/所有付费方案均不限团队人数与访客席位/)).toBeInTheDocument();
  });
});
