import { PricingContent } from './PricingContent';

export const metadata = {
  title: '方案定价 - 虚拟资料室 (VDR) 与安全文档追踪 | ConeShare',
  description:
    '不按席位收费，也没有团队人数限制。ConeShare 提供 Community 开源自建、Pro 商业自托管、Managed BYOC 官方托管私有云，以及面向企业高可用与定制需求的 Enterprise 版本，数据 100% 留在你自己的云端。',
  keywords: [
    'ConeShare 定价',
    '虚拟资料室价格',
    'DocSend 替代品',
    '自托管资料室',
    'BYOC 私有云',
    'VDR 价格对比',
  ],
  alternates: {
    canonical: '/zh/pricing',
  },
};

export default function ZhPricingPage() {
  return <PricingContent />;
}
