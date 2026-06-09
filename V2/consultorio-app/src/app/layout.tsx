import type { ReactNode } from "react";

import "./globals.css";

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
