import { PricingContent } from './PricingContent';

export const metadata = {
  title: '方案定价 - 虚拟资料室 (VDR) 与安全文档追踪 | ConeShare',
  description:
    '无需按席位付费，不设团队人数限制。ConeShare 提供开源自建、托管私有云 (Managed BYOC) 与企业授权方案。数据 100% 驻留于自有云端与存储。',
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
