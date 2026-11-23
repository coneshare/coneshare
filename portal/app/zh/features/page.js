import { FeaturesIndexView, buildFeaturesIndexMetadata } from '../../../components/FeaturesViews';

export const metadata = buildFeaturesIndexMetadata('zh');

export default function ZhFeaturesPage() {
  return <FeaturesIndexView locale="zh" />;
}
