"use client";

import { useEffect, useState } from "react";
import _sodium from "libsodium-wrappers";

type SummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; title: string | null; fileName: string; url: string; mimeType: string };

function readKeyFromFragment(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  // Formato: #k=<llave base64url>
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return params.get("k");
}

export function SummaryClient({ token }: { token: string }) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });

  useEffect(() => {
    let revokeUrl: string | null = null;

    async function load() {
      const key = readKeyFromFragment();
      if (!key) {
        setState({ status: "error", message: "El enlace esta incompleto. Pide al consultorio que te lo reenvie." });
        return;
      }

      try {
        const response = await fetch(`/api/public/summaries/${token}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Este resumen ya no esta disponible.");
        }

        await _sodium.ready;
        const sodium = _sodium;
        const keyBytes = sodium.from_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING);
        const payload = sodium.from_base64(data.ciphertext, sodium.base64_variants.ORIGINAL);
        // payload = nonce(24) || mac||ciphertext
        const nonce = payload.slice(0, sodium.crypto_secretbox_NONCEBYTES);
        const combined = payload.slice(sodium.crypto_secretbox_NONCEBYTES);
        const plain = sodium.crypto_secretbox_open_easy(combined, nonce, keyBytes);

        const mimeType = typeof data.mimeType === "string" ? data.mimeType : "application/pdf";
        // Copia a un Uint8Array respaldado por ArrayBuffer (tipo que acepta Blob).
        const blob = new Blob([new Uint8Array(plain)], { type: mimeType });
        const url = URL.createObjectURL(blob);
        revokeUrl = url;
        const title = typeof data.title === "string" ? data.title : null;
        const ext = mimeType === "application/pdf" ? "pdf" : "bin";

        setState({
          status: "ready",
          title,
          fileName: `${(title ?? "resumen").replace(/[^\w.-]+/g, "-")}.${ext}`,
          url,
          mimeType
        });
      } catch (error) {
        setState({
          status: "error",
          message:
            error instanceof Error && error.message.includes("disponible")
              ? error.message
              : "No se pudo abrir el resumen. El enlace puede ser incorrecto o haber expirado."
        });
      }
    }

    void load();
    return () => {
      if (revokeUrl) {
        URL.revokeObjectURL(revokeUrl);
      }
    };
  }, [token]);

  return (
    <section className="booking-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Resumen autorizado</span>
          <h2>{state.status === "ready" && state.title ? state.title : "Tu resumen clinico"}</h2>
        </div>

        {state.status === "loading" ? (
          <p className="field-hint">Descifrando tu resumen en este dispositivo…</p>
        ) : null}

        {state.status === "error" ? (
          <p className="form-error" role="alert">
            {state.message}
          </p>
        ) : null}

        {state.status === "ready" ? (
          <>
            <p className="field-hint">
              Este resumen se descifro en tu navegador. Nuestros servidores nunca vieron su contenido.
            </p>
            <div className="button-row">
              <a className="action-button" href={state.url} download={state.fileName}>
                Descargar resumen
              </a>
              <a className="ghost-button" href={state.url} target="_blank" rel="noreferrer">
                Abrir en una pestaña
              </a>
            </div>
          </>
        ) : null}
      </article>
    </section>
  );
}
