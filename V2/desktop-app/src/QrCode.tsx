import { useMemo, useState } from "react";
import { QR_QUIET_ZONE, qrMatrix, qrPath } from "./qrModel";

const PRINTING_CLASS = "printing-qr";

/** QR en SVG (sin estilos en linea: la CSP de produccion no los permite). */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(text);
    return { size: matrix.length + QR_QUIET_ZONE * 2, path: qrPath(matrix) };
  }, [text]);
  return (
    <svg className="qr-code" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

/**
 * Boton "Mostrar QR" para un enlace de preconsulta: el paciente lo escanea en
 * la pantalla o el medico lo imprime para la sala de espera.
 */
export function QrShare({ url, title, hint }: { url: string; title: string; hint: string }) {
  const [open, setOpen] = useState(false);

  function print() {
    // Solo la hoja del QR sale en la impresion (App.css, @media print).
    document.body.classList.add(PRINTING_CLASS);
    const done = () => {
      document.body.classList.remove(PRINTING_CLASS);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  return (
    <div className="stack">
      <div className="button-row">
        <button className="ghost-button" onClick={() => setOpen((current) => !current)}>
          {open ? "Ocultar QR" : "Mostrar QR"}
        </button>
        {open ? (
          <button className="ghost-button" onClick={print}>
            Imprimir
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="qr-share">
          <div className="qr-print">
            <h3>{title}</h3>
            <QrCode text={url} label={`Código QR de ${title}`} />
            <p>{hint}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
