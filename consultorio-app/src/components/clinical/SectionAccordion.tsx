"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function SectionAccordion({ title, badge, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="font-medium text-left flex-1">{title}</span>
        {badge}
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}
