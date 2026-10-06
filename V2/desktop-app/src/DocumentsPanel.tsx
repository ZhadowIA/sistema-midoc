import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { call } from "./ipc";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_INPUT_ACCEPT,
  categoryLabel,
  formatBytes,
  groupDocumentsByEncounter,
  screenFiles,
  type DocumentCategory,
  type DocumentMeta
} from "./documentsModel";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

// btoa sobre un string gigante revienta la pila: se arma por bloques.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

// `call` rechaza con Error; String(e) antepondria "Error: " al mensaje de Rust.
function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface Preview {
  meta: DocumentMeta;
  url: string;
}

/**
 * Documentos del expediente (paso 28, rebanada 1). En el expediente los
 * archivos quedan ligados solo al paciente; dentro de una consulta, tambien a
 * esa consulta. Todo vive en la base cifrada local.
 */
export function DocumentsPanel({
  patientId,
  encounterId = null,
  heading = "Documentos"
}: {
  patientId: string;
  encounterId?: string | null;
  heading?: string;
}) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [category, setCategory] = useState<DocumentCategory>("LABORATORIO");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    call<DocumentMeta[]>("documents_list", { patientId })
      .then(setDocuments)
      .catch((e: unknown) => setErrors([errorText(e)]));
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  // Libera la URL del archivo en memoria al cerrar la vista previa, y deja
  // cerrarla con Escape.
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  async function addFiles(fileList: FileList | File[]) {
    const { accepted, rejected } = screenFiles(Array.from(fileList));
    const nextErrors = rejected.map(({ file, reason }) => `${file.name}: ${reason}.`);
    setMessage("");
    setBusy(true);
    let added = 0;
    for (const file of accepted) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await call<DocumentMeta>("documents_add", {
          document: {
            patient_id: patientId,
            encounter_id: encounterId,
            file_name: file.name,
            category,
            title: null,
            content_base64: bytesToBase64(bytes)
          }
        });
        added += 1;
      } catch (e) {
        nextErrors.push(`${file.name}: ${errorText(e)}.`);
      }
    }
    setBusy(false);
    setErrors(nextErrors);
    if (added > 0) {
      setMessage(added === 1 ? "Documento agregado al expediente." : `${added} documentos agregados al expediente.`);
      load();
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  }

  async function openPreview(meta: DocumentMeta) {
    setErrors([]);
    try {
      const content = await call<{ meta: DocumentMeta; content_base64: string }>("documents_read", {
        documentId: meta.id
      });
      const url = URL.createObjectURL(base64ToBlob(content.content_base64, content.meta.mime_type));
      setPreview({ meta: content.meta, url });
    } catch (e) {
      setErrors([errorText(e)]);
    }
  }

  async function removeDocument(meta: DocumentMeta) {
    const confirmed = window.confirm(
      `¿Retirar "${meta.title ?? meta.file_name}" del expediente? Usalo para corregir un archivo ` +
        "adjuntado al paciente equivocado. Queda constancia en la bitacora."
    );
    if (!confirmed) return;
    setErrors([]);
    setMessage("");
    try {
      await call("documents_delete", { documentId: meta.id });
      setMessage("Documento retirado del expediente.");
      load();
    } catch (e) {
      setErrors([errorText(e)]);
    }
  }

  const groups = groupDocumentsByEncounter(documents, encounterId);

  return (
    <section className="documents-panel" aria-label={heading}>
      <div className="panel-header">
        <h3>{heading}</h3>
        <p>
          {encounterId
            ? "Estudios, imagenes y referencias de esta consulta. Se guardan cifrados en este equipo."
            : "Estudios, imagenes y referencias del paciente. Se guardan cifrados en este equipo."}
        </p>
      </div>

      <div
        className={dragging ? "documents-dropzone documents-dropzone-active" : "documents-dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <p>
          <strong>{busy ? "Guardando…" : "Arrastra aqui los archivos"}</strong>
          <span className="meta">PDF, PNG, JPG o WEBP, hasta 20 MB cada uno.</span>
        </p>
        <div className="documents-dropzone-controls">
          <label className="field compact-field">
            <span>Categoria</span>
            <select
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.currentTarget.value as DocumentCategory)}
            >
              {DOCUMENT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ghost-button"
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Elegir archivos
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={DOCUMENT_INPUT_ACCEPT}
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files && files.length > 0) void addFiles(Array.from(files));
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <div className="form-error" role="alert">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="meta">Sin documentos en el expediente de este paciente.</p>
      ) : (
        groups.map((group) => (
          <div className="documents-group" key={group.encounterId ?? "sin-consulta"}>
            <span className="sidebar-heading">
              {group.encounterId === null
                ? "Sin consulta"
                : group.encounterId === encounterId
                  ? "Esta consulta"
                  : `Consulta del ${group.openedAt ? dateFormatter.format(new Date(group.openedAt)) : "—"}`}
            </span>
            <ul className="documents-list">
              {group.documents.map((meta) => (
                <li className="list-row documents-row" key={meta.id}>
                  <button type="button" className="list-row-main documents-open" onClick={() => void openPreview(meta)}>
                    <strong>{meta.title ?? meta.file_name}</strong>
                    <span className="meta">
                      {categoryLabel(meta.category)} · {meta.mime_type === "application/pdf" ? "PDF" : "Imagen"} ·{" "}
                      {formatBytes(meta.size_bytes)} · {dateFormatter.format(new Date(meta.received_at))}
                      {meta.source === "MAILBOX" ? " · llego por el portal" : ""}
                    </span>
                  </button>
                  <div className="row-actions">
                    <button className="ghost-button" type="button" onClick={() => void openPreview(meta)}>
                      Ver
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void removeDocument(meta)}>
                      Retirar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {preview ? (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div
            className="modal-shell documents-preview"
            role="dialog"
            aria-modal="true"
            aria-label={preview.meta.title ?? preview.meta.file_name}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="documents-preview-header">
              <strong>{preview.meta.title ?? preview.meta.file_name}</strong>
              {/* Foco inicial en "Cerrar": Escape cierra la vista de imagenes.
                  El visor de PDF de WebView2 retiene el teclado, ahi se cierra
                  con este boton o con clic fuera. */}
              <button className="ghost-button" type="button" autoFocus onClick={() => setPreview(null)}>
                Cerrar
              </button>
            </div>
            {preview.meta.mime_type === "application/pdf" ? (
              <iframe className="documents-preview-frame" src={preview.url} title={preview.meta.file_name} />
            ) : (
              <img className="documents-preview-image" src={preview.url} alt={preview.meta.file_name} />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
