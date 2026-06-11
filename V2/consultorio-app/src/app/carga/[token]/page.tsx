import { getUploadLinkForUpload } from "../../../services/documents/document-service";
import { UploadClient } from "./upload-client";

export default async function DocumentUploadPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Se resuelve el enlace antes de construir JSX (sin try/catch alrededor del
  // render): exito -> props de carga; error -> mensaje para el cliente.
  const resolved = await getUploadLinkForUpload(token)
    .then((info) => ({ info, errorMessage: undefined }))
    .catch((error: unknown) => ({
      info: undefined,
      errorMessage: error instanceof Error ? error.message : "Este enlace no es valido."
    }));

  if (!resolved.info) {
    return <UploadClient token={token} errorMessage={resolved.errorMessage} />;
  }

  return (
    <UploadClient
      token={token}
      patientFirstName={resolved.info.patientFirstName}
      documentPublicKey={resolved.info.documentPublicKey}
      maxUploads={resolved.info.maxUploads}
      uploadCount={resolved.info.uploadCount}
      expiresAt={resolved.info.expiresAt.toISOString()}
    />
  );
}
