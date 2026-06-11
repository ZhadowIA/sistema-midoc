import { SummaryClient } from "./summary-client";

// El token va en la ruta; la llave viaja en el fragmento (#k=...), que solo ve
// el navegador. Por eso la descarga y el descifrado ocurren en el cliente.
export default async function AuthorizedSummaryPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SummaryClient token={token} />;
}
