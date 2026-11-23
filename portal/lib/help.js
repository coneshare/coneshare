import fs from 'node:fs';
import path from 'node:path';
import 'server-only';
import {
  filterAndSortHelpGuides,
  getBilingualHelpSlugs as collectBilingualHelpSlugs,
  groupHelpGuidesBySection,
  isPublishedHelpGuide,
  normalizeHelpGuide,
} from './help-utils';

const HELP_ROOT_DIR = path.join(process.cwd(), 'content', 'help');

function getHelpDir(locale = 'en') {
  return locale === 'zh' ? path.join(HELP_ROOT_DIR, 'zh') : HELP_ROOT_DIR;
}

function getHelpSlugs(locale = 'en') {
  const dir = getHelpDir(locale);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.replace(/\.mdx$/, ''));
}

async function importHelpModule(slug, locale = 'en') {
  try {
    const helpModule =
      locale === 'zh'
        ? await import(`../content/help/zh/${slug}.mdx`)
        : await import(`../content/help/${slug}.mdx`);
    return normalizeHelpGuide(slug, helpModule.metadata || {}, helpModule.default, locale);
  } catch {
    return null;
  }
}

export async function getHelpGuideBySlug(slug, locale = 'en') {
  const guide = await importHelpModule(slug, locale);
  return isPublishedHelpGuide(guide, locale) ? guide : null;
}

export async function getAllHelpGuides(locale = 'en') {
  const slugs = getHelpSlugs(locale);
  const guides = await Promise.all(slugs.map((slug) => importHelpModule(slug, locale)));
  return filterAndSortHelpGuides(guides, locale);
}

export async function getHelpSectionsWithGuides(locale = 'en') {
  const guides = await getAllHelpGuides(locale);
  return groupHelpGuidesBySection(guides, locale);
}

export async function getBilingualHelpSlugs() {
  const [enGuides, zhGuides] = await Promise.all([
    getAllHelpGuides('en'),
    getAllHelpGuides('zh'),
  ]);
  return collectBilingualHelpSlugs(enGuides, zhGuides);
}
