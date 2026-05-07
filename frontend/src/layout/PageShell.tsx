import React from "react";

type PageShellProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function PageShell({ title, subtitle, eyebrow = "Vista de referencia", actions, children }: PageShellProps) {
  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-white px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-foreground sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-[72ch] text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
