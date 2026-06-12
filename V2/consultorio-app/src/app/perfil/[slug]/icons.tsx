// Set de iconos de trazo fino para el perfil publico.
// Heredan tamano via font-size (1em) y color via currentColor.

type IconProps = {
  className?: string;
};

const base = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true
};

export function IconPin({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s-6.5-5.3-6.5-10.2A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.8C18.5 15.7 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </svg>
  );
}

export function IconPhone({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 4h3l1.2 3.2-1.6 1.3a11 11 0 0 0 5.1 5.1l1.3-1.6L18.8 17v3a1 1 0 0 1-1.1 1A14.5 14.5 0 0 1 4.5 7.8 1 1 0 0 1 5.5 4Z" />
    </svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V6a1 1 0 0 1 1-1Z" />
      <path d="M8.5 10h7M8.5 13h4" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.8 1.8" />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="m12 3.2 2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 21.9 6.8 22.1l1.2-5.8-4.4-4 5.9-.7Z" />
    </svg>
  );
}

export function IconStethoscope({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 4v4a4 4 0 0 0 8 0V4" />
      <path d="M6 4H4.5M14 4h1.5" />
      <path d="M10 16v0a5 5 0 0 0 10 0v-2" />
      <circle cx="20" cy="11.5" r="2" />
    </svg>
  );
}

export function IconCertificate({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4" width="16" height="12" rx="1.5" />
      <path d="M7.5 8.5h9M7.5 11.5h5" />
      <path d="M12 16v4l2-1.4L16 20v-4" />
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="5.5" width="16" height="15" rx="1.6" />
      <path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14.5 6 9 12l5.5 6" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9.5 6 15 12l-5.5 6" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 7 10 17l-5-5" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Marcas de galeria: ilustraciones lineales sobrias en vez de emojis.
export function IconRoom({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M4 20h16M9.5 20v-5h5v5" />
    </svg>
  );
}

export function IconWaiting({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 20v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" />
      <path d="M5 14h14M8 20v-2M16 20v-2M8 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
    </svg>
  );
}

export function IconEquipment({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4v16M4 12h16" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}
