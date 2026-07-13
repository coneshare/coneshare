### 2026-07-13 Session Entry
- **Category:** Gotcha
- **Context/Implication:** The portal uses Next.js static exports (`output: 'export'`), which compiles to plain static HTML files. Using dynamic server-side redirection methods (like calling `redirect()` from `next/navigation`) crashes during the static build generation process.
- **Resolution/Action:** Implement SEO-friendly redirects on static export pages by defining static page metadata in a Server Component containing alternates and refresh metadata tags:
  ```javascript
  export const metadata = {
    alternates: { canonical: '/new-target' },
    other: { 'refresh': '0; url=/new-target' }
  };
  ```

### 2026-07-13 Session Entry
- **Category:** Architecture Choice / SEO
- **Context/Implication:** To improve search engine visibility and support rich expandable snippet accordions on SERP pages, landing pages with static FAQs should include structured FAQ data.
- **Resolution/Action:** Add structured `FAQPage` JSON-LD schemas inside Next.js App Router Server Components by rendering a script tag:
  ```javascript
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a }
    }))
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* Content */}
    </>
  );
  ```
