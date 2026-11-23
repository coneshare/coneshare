import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HelpSidebar from '../../components/HelpSidebar';
import {
  buildHelpLanguageAlternates,
  filterAndSortHelpGuides,
  getBilingualHelpSlugs,
  getPrevNextGuides,
  groupHelpGuidesBySection,
  isPublishedHelpGuide,
  normalizeHelpGuide,
} from '../../lib/help-utils';

const sampleGuides = [
  normalizeHelpGuide(
    'datarooms',
    { title: 'Virtual Datarooms', navTitle: 'Datarooms', section: 'datarooms', order: 1 },
    null,
    'en'
  ),
  normalizeHelpGuide(
    'dynamic-watermarking',
    { title: 'Dynamic Watermarks', section: 'sharing-security', order: 2 },
    null,
    'en'
  ),
  normalizeHelpGuide(
    'secure-sharing',
    { title: 'Sharing & Access Controls', section: 'sharing-security', order: 1 },
    null,
    'en'
  ),
  normalizeHelpGuide(
    'getting-started',
    { title: 'Workspace Basics', section: 'getting-started', order: 1 },
    null,
    'en'
  ),
  normalizeHelpGuide(
    'draft-guide',
    { title: 'Unpublished Draft', section: 'getting-started', order: 2, published: false },
    null,
    'en'
  ),
  normalizeHelpGuide(
    'getting-started',
    { title: '工作区基础', section: 'getting-started', order: 1 },
    null,
    'zh'
  ),
];

describe('portal/lib/help-utils', () => {
  it('filters unpublished guides and sorts by section and order', () => {
    const enGuides = filterAndSortHelpGuides(sampleGuides, 'en');
    expect(enGuides.map((g) => g.slug)).toEqual([
      'getting-started',
      'secure-sharing',
      'dynamic-watermarking',
      'datarooms',
    ]);
  });

  it('groups sorted guides into localized sections', () => {
    const sections = groupHelpGuidesBySection(sampleGuides, 'en');
    expect(sections.map((s) => s.id)).toEqual([
      'getting-started',
      'sharing-security',
      'datarooms',
    ]);
    expect(sections[1].guides.map((g) => g.slug)).toEqual([
      'secure-sharing',
      'dynamic-watermarking',
    ]);

    const zhSections = groupHelpGuidesBySection(sampleGuides, 'zh');
    expect(zhSections).toHaveLength(1);
    expect(zhSections[0].title).toBe('快速入门');
  });

  it('computes previous/next pagination and bilingual matching slugs', () => {
    const enGuides = filterAndSortHelpGuides(sampleGuides, 'en');
    expect(getPrevNextGuides(enGuides, 'getting-started')).toEqual({
      prevGuide: null,
      nextGuide: enGuides[1],
    });
    expect(getPrevNextGuides(enGuides, 'secure-sharing')).toEqual({
      prevGuide: enGuides[0],
      nextGuide: enGuides[2],
    });
    expect(getBilingualHelpSlugs(enGuides, filterAndSortHelpGuides(sampleGuides, 'zh'))).toEqual([
      'getting-started',
    ]);
  });

  it('excludes unpublished or mismatched-locale single guides and builds zh-CN hreflang alternates', () => {
    const publishedEn = normalizeHelpGuide('getting-started', { title: 'Basics' }, null, 'en');
    const draftEn = normalizeHelpGuide(
      'draft-guide',
      { title: 'Draft', published: false },
      null,
      'en'
    );

    expect(isPublishedHelpGuide(publishedEn, 'en')).toBe(true);
    expect(isPublishedHelpGuide(publishedEn, 'zh')).toBe(false);
    expect(isPublishedHelpGuide(draftEn, 'en')).toBe(false);
    expect(isPublishedHelpGuide(null, 'en')).toBe(false);

    expect(buildHelpLanguageAlternates('https://www.coneshare.com')).toEqual({
      en: 'https://www.coneshare.com/help',
      'zh-CN': 'https://www.coneshare.com/zh/help',
    });
    expect(buildHelpLanguageAlternates('https://www.coneshare.com', 'getting-started')).toEqual({
      en: 'https://www.coneshare.com/help/getting-started',
      'zh-CN': 'https://www.coneshare.com/zh/help/getting-started',
    });
  });
});

describe('HelpSidebar Component', () => {
  it('marks active article with aria-current and toggles accessible mobile drawer', () => {
    const sections = groupHelpGuidesBySection(sampleGuides, 'en');
    render(
      <HelpSidebar
        sections={sections}
        currentSlug="secure-sharing"
        currentTitle="Sharing & Access Controls"
        basePath="/help"
        locale="en"
      />
    );

    const activeLinks = screen.getAllByRole('link', { name: 'Sharing & Access Controls' });
    expect(activeLinks[0]).toHaveAttribute('aria-current', 'page');
    expect(activeLinks[0]).toHaveClass('bg-gray-100', 'font-semibold', 'text-gray-900');

    const toggleButton = screen.getByRole('button', {
      name: /User Guide · Sharing & Access Controls/i,
    });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    const controlsId = toggleButton.getAttribute('aria-controls');
    expect(document.getElementById(controlsId)).not.toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    const mobileNav = document.getElementById(controlsId);
    expect(mobileNav).toBeInTheDocument();

    const mobileLink = mobileNav.querySelector('a[href="/help/datarooms"]');
    expect(mobileLink).not.toBeNull();
    fireEvent.click(mobileLink);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });
});
