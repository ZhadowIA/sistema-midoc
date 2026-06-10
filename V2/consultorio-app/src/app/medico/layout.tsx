import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "../../lib/auth/session-cookie";
import { validateAuthSession } from "../../services/auth/auth-service";
import { LogoutButton } from "./logout-button";
import { TopbarLink } from "./topbar-link";

export default async function MedicoLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await validateAuthSession(sessionToken) : null;

  return (
    <>
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <a className="brand-mark" href={user ? "/medico/agenda" : "/"}>
            MiDoc
          </a>
          {user ? (
            <>
              <nav className="topbar-nav" aria-label="Navegacion principal">
                <TopbarLink href="/medico/agenda">Agenda</TopbarLink>
                <TopbarLink href="/medico/configuracion">Configuracion</TopbarLink>
              </nav>
              <LogoutButton />
            </>
          ) : null}
        </div>
      </header>
      <div className="medico-content">{children}</div>
    </>
  );
}
