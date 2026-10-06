import { NextResponse, type NextRequest } from "next/server";

import { isFrozenPath, isFrozenScopeEnabled } from "./lib/scope";

// Apaga los modulos congelados por el reenfoque (ver `lib/scope.ts`). La API
// responde 404 en JSON; las paginas redirigen a la entrada vigente: el medico a
// su cuenta y cualquier otra a la pagina de inicio.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isFrozenScopeEnabled() || !isFrozenPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Este modulo no esta disponible." }, { status: 404 });
  }

  const target = pathname.startsWith("/medico/") ? "/medico/cuenta" : "/";
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
