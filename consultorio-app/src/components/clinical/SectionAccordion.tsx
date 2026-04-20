"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SectionAccordion({
  title,
  badge,
  defaultOpen = false,
  children,
  id,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden">
      <button
        type="button"
        id={id}
        data-consultation-section={id ?? undefined}
        onClick={() => setOpen(!open)}
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
