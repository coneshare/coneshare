import { PricingContent } from './PricingContent';

export const metadata = {
  title: '方案定价 - 虚拟资料室 (VDR) 与私有化部署托管 | ConeShare',
  description:
    '不按席位收费，也没有团队人数限制。ConeShare 提供 Community 永久免费开源自建、$299 一次性白手套私有化部署、Managed BYOC 官方托管私有云，以及按需技术支持与企业定制方案，数据 100% 留在你自己的云端。',
  keywords: [
    'ConeShare 定价',
    '虚拟资料室价格',
    'DocSend 替代品',
    '自托管资料室',
    '私有化部署服务',
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
