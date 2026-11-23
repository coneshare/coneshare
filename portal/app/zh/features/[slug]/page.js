import { features } from '../../../../lib/content';
import {
  FeatureDetailView,
  buildFeatureDetailMetadata,
} from '../../../../components/FeaturesViews';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildFeatureDetailMetadata(slug, 'zh');
}

export default async function ZhFeatureDetailPage({ params }) {
  const { slug } = await params;
  return <FeatureDetailView slug={slug} locale="zh" />;
}

export async function generateStaticParams() {
  return features.map((feature) => ({
    slug: feature.slug,
  }));
}
