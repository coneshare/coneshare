import { getAllHelpGuides } from '../../../lib/help';
import { HelpArticleView, buildHelpArticleMetadata } from '../../../components/HelpViews';

export async function generateStaticParams() {
  const guides = await getAllHelpGuides('en');
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildHelpArticleMetadata(slug, 'en');
}

export default async function HelpArticlePage({ params }) {
  const { slug } = await params;
  return <HelpArticleView slug={slug} locale="en" />;
}
