"use client";

import { useState } from "react";
import _sodium from "libsodium-wrappers";

type UploadClientProps = {
  token: string;
  patientFirstName?: string;
  documentPublicKey?: string;
  maxUploads?: number;
  uploadCount?: number;
  expiresAt?: string;
  errorMessage?: string;
};

// Tope del archivo en claro (el ciphertext que viaja es algo mayor). El portal
// rechaza ciphertext mayor a 12 MB; 8 MB de archivo deja margen de sobra.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.webp,.heic";

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

/**
 * Construye el sobre [metaLen BE u32][metaJSON][bytes del archivo]. El nombre y
 * el tipo viajan cifrados aqui dentro; la nube nunca los ve. El mismo formato
 * lo descifra la app del medico (Rust) al sincronizar.
 */
function buildEnvelope(file: File, fileBytes: Uint8Array): Uint8Array {
  const meta = JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream" });
  const metaBytes = new TextEncoder().encode(meta);
  const envelope = new Uint8Array(4 + metaBytes.length + fileBytes.length);
  new DataView(envelope.buffer).setUint32(0, metaBytes.length, false);
  envelope.set(metaBytes, 4);
  envelope.set(fileBytes, 4 + metaBytes.length);
  return envelope;
}

export function UploadClient(props: UploadClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState(0);

  const disabled = Boolean(props.errorMessage);
  const remaining =
    props.maxUploads !== undefined ? props.maxUploads - (props.uploadCount ?? 0) - uploaded : undefined;
  const exhausted = remaining !== undefined && remaining <= 0;

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file || !props.documentPublicKey) {
      setError("Elige un archivo primero.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo supera el limite de 8 MB.");
      return;
    }

    setBusy(true);
    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const envelope = buildEnvelope(file, fileBytes);

      await _sodium.ready;
      const sodium = _sodium;
      const publicKey = sodium.from_base64(props.documentPublicKey, sodium.base64_variants.ORIGINAL);
      // Sealed box: cifrado anonimo con la llave publica del medico. Solo el
      // medico, con su llave secreta local, puede abrirlo.
      const sealed = sodium.crypto_box_seal(envelope, publicKey);
      const ciphertext = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);

      const response = await fetch(`/api/public/upload/${props.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ciphertext })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "No se pudo subir el documento.");
      }

      setUploaded((count) => count + 1);
      setFile(null);
      setMessage("Documento enviado de forma cifrada. El consultorio lo recibira al sincronizar.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir el documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="booking-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Carga de documentos</span>
          <h2>
            {props.patientFirstName ? `Hola, ${props.patientFirstName}` : "Enlace de carga"}
          </h2>
        </div>

        {disabled ? (
          <p className="form-error" role="alert">
            {props.errorMessage}
          </p>
        ) : (
          <>
            <p className="field-hint">
              Tus documentos se cifran en este dispositivo antes de enviarse. El consultorio es el
              unico que puede abrirlos; nuestros servidores nunca ven su contenido.
            </p>

            {props.expiresAt ? (
              <p className="field-hint">
                Este enlace vence el {dateFormatter.format(new Date(props.expiresAt))}.
                {remaining !== undefined ? ` Subidas restantes: ${Math.max(remaining, 0)}.` : null}
              </p>
            ) : null}

            {message ? (
              <p className="form-success" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            {exhausted ? (
              <p className="field-hint">Este enlace ya alcanzo su limite de subidas.</p>
            ) : (
              <form className="booking-form" onSubmit={handleUpload}>
                <label className="field field-full">
                  <span>Selecciona un estudio o documento</span>
                  <input
                    type="file"
                    accept={ACCEPTED}
                    onChange={(changeEvent) => setFile(changeEvent.currentTarget.files?.[0] ?? null)}
                  />
                </label>

                <div className="button-row">
                  <button className="action-button" type="submit" disabled={busy || !file}>
                    {busy ? "Cifrando y enviando…" : "Enviar de forma segura"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </article>
    </section>
  );
}
