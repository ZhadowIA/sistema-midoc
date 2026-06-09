import "./globals.css";
import type { Metadata } from "next";
import { SessionGuardian } from "@/components/SessionGuardian";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Consultorio Médico",
  description: "Agenda y administración de citas",
  applicationName: "MiDoc",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MiDoc",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="antialiased" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <SessionGuardian />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
