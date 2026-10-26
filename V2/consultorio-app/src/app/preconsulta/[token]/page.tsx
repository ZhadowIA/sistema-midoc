import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicPreconsulta } from "../../../services/preconsulta/submission-service";
import { PreconsultaClient } from "./preconsulta-client";

export const metadata: Metadata = {
  title: "Preconsulta",
  // Enlace privado del medico: que no lo indexen los buscadores.
  robots: { index: false, follow: false }
};

// Formulario de preconsulta (paso 32, rebanada 2). El paciente lo contesta sin
// cuenta; todo se cifra en su celular para la llave del medico antes de enviarse.
export default async function PreconsultaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preconsulta = await getPublicPreconsulta(token);
  if (!preconsulta) notFound();
  return <PreconsultaClient token={token} preconsulta={preconsulta} />;
}
