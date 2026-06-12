import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Public_Sans, Spectral } from "next/font/google";

import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap"
});

// Serif editorial — solo para superficies publicas (perfil del medico).
// Expuesta como variable; el UI de producto sigue usando Public Sans.
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: {
    default: "MiDoc",
    template: "%s · MiDoc"
  },
  description: "Agenda y atencion clinica para consultorios."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es-MX" className={`${publicSans.className} ${spectral.variable}`}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
