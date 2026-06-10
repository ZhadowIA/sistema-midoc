import type { Metadata } from "next";

import { ConfiguracionClient } from "./configuracion-client";

export const metadata: Metadata = {
  title: "Configuracion"
};

export default function ConfiguracionPage() {
  return <ConfiguracionClient />;
}
