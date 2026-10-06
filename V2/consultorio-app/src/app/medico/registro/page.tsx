import type { Metadata } from "next";
import { connection } from "next/server";

import { isFrozenScopeEnabled } from "../../../lib/scope";
import { RegistroClient } from "./registro-client";

export const metadata: Metadata = {
  title: "Registro"
};

export default async function RegistroPage() {
  // La bandera se lee al arrancar, no al compilar (ver `app/page.tsx`).
  await connection();
  return <RegistroClient frozenScope={isFrozenScopeEnabled()} />;
}
