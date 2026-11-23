import { getAllHelpGuides } from '../../../../lib/help';
import { HelpArticleView, buildHelpArticleMetadata } from '../../../../components/HelpViews';

export async function generateStaticParams() {
  const guides = await getAllHelpGuides('zh');
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return buildHelpArticleMetadata(slug, 'zh');
}

export default async function ZhHelpArticlePage({ params }) {
  const { slug } = await params;
  return <HelpArticleView slug={slug} locale="zh" />;
}
