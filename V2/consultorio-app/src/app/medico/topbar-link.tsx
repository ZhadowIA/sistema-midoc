"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function TopbarLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isCurrent = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <a className="topbar-link" href={href} aria-current={isCurrent ? "page" : undefined}>
      {children}
    </a>
  );
}
