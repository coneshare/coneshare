'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getAgentFaqs } from '../lib/agentsData';

export function AgentsFaq({ locale = 'en', faqs }) {
  const items = faqs || getAgentFaqs(locale);
  const [openIndex, setOpenIndex] = useState(0);

  const toggle = (idx) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <div className="divide-y divide-gray-200 border-y border-gray-200">
      {items.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={faq.question} className="py-6">
            <button
              type="button"
              onClick={() => toggle(idx)}
              className="flex w-full items-start justify-between text-left text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-900 rounded-sm cursor-pointer"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold leading-7">{faq.question}</span>
              <span className="ml-6 flex h-7 items-center">
                <ChevronDown
                  className={`h-5 w-5 transform text-gray-500 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-gray-900' : ''
                  }`}
                />
              </span>
            </button>
            {isOpen && (
              <div className="mt-3 pr-12 text-sm leading-6 text-gray-600">
                <p>{faq.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
