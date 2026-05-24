'use client';

import { useEffect, useMemo, useState } from 'react';

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function BlogToc() {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const container = document.querySelector('.js-blog-content');
    if (!container) return;

    const headings = Array.from(container.querySelectorAll('h2, h3'));
    const usedIds = new Set();

    const nextItems = headings.map((heading) => {
      const level = heading.tagName.toLowerCase();
      let id = heading.id;
      heading.classList.add('scroll-mt-28');

      if (!id) {
        const base = slugify(heading.textContent);
        let candidate = base || 'section';
        let i = 2;
        while (usedIds.has(candidate) || document.getElementById(candidate)) {
          candidate = `${base || 'section'}-${i}`;
          i += 1;
        }
        id = candidate;
        heading.id = id;
      }

      usedIds.add(id);

      return {
        id,
        text: (heading.textContent || '').trim(),
        level,
      };
    });

    setItems(nextItems.filter((item) => item.text));
  }, []);

  useEffect(() => {
    if (items.length === 0) return;

    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean);

    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
          return;
        }

        const passed = headings.filter((heading) => heading.getBoundingClientRect().top < 140);
        if (passed.length > 0) {
          setActiveId(passed[passed.length - 1].id);
        }
      },
      {
        rootMargin: '-120px 0px -55% 0px',
        threshold: [0, 1],
      }
    );

    headings.forEach((heading) => observer.observe(heading));
    setActiveId(headings[0].id);

    return () => observer.disconnect();
  }, [items]);

  const hasItems = useMemo(() => items.length > 0, [items]);

  if (!hasItems) return null;

  return (
    <aside className="hidden lg:block lg:w-72 xl:w-80 lg:shrink-0 lg:self-start lg:sticky lg:top-24">
      <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">On this page</p>
        <nav className="mt-3">
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`flex items-start gap-2 rounded-md py-1 text-sm leading-6 transition-colors ${
                    item.level === 'h3' ? 'pl-4' : ''
                  } ${
                    activeId === item.id
                      ? 'bg-gray-100 font-semibold text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span>{item.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
