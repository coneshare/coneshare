import { features } from '../../../lib/content';
import {
  FeatureDetailView,
  buildFeatureDetailMetadata,
} from '../../../components/FeaturesViews';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildFeatureDetailMetadata(slug, 'en');
}

export default async function FeatureDetailPage({ params }) {
  const { slug } = await params;
  return <FeatureDetailView slug={slug} locale="en" />;
}

export async function generateStaticParams() {
  return features.map((feature) => ({
    slug: feature.slug,
  }));
}
