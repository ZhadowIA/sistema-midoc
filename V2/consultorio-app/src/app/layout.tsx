import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Public_Sans } from "next/font/google";

import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap"
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
    <html lang="es-MX" className={publicSans.className}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
