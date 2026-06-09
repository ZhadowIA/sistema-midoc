import React from "react";
import { cn } from "../utils/cn";

export type TabItem = { id: string; label: string };

type TabsProps = {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel?: string;
};

export function Tabs({ tabs, activeTab, onChange, ariaLabel = "Navegación por pestañas" }: TabsProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!tabs.length) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onChange(tabs[(index + 1) % tabs.length].id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(tabs[(index - 1 + tabs.length) % tabs.length].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      onChange(tabs[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      onChange(tabs[tabs.length - 1].id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2 rounded-xl border border-border bg-white p-2"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-controls={`tabpanel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={cn(
            "min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            activeTab === tab.id
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
