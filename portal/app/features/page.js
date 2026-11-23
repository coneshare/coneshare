import { FeaturesIndexView, buildFeaturesIndexMetadata } from '../../components/FeaturesViews';

export const metadata = buildFeaturesIndexMetadata('en');

export default function FeaturesPage() {
  return <FeaturesIndexView locale="en" />;
}
