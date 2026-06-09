import React, { useState } from "react";
import { cn } from "../utils/cn";

type AccordionItem = {
  id: string;
  title: string;
  content: React.ReactNode;
};

type SectionAccordionProps = {
  items: AccordionItem[];
};

export function SectionAccordion({ items }: SectionAccordionProps) {
  const [openItem, setOpenItem] = useState(items[0]?.id ?? "");

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openItem === item.id;
        const buttonId = `accordion-trigger-${item.id}`;
        const panelId = `accordion-panel-${item.id}`;
        return (
          <section key={item.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/70">
            <button
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setOpenItem(isOpen ? "" : item.id)}
            >
              <span className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</span>
              <span className={cn("text-gray-600 transition-transform dark:text-gray-300", isOpen && "rotate-180")}>⌄</span>
            </button>
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="border-t border-gray-100 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                {item.content}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
