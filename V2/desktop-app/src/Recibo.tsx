import { useEffect, useRef, useState } from "react";
import { call } from "./ipc";

/**
 * Recibo entregable al paciente (paso 27, rebanada 1).
 *
 * Es un documento, no pantalla de app: cuando se imprime desaparece todo el
 * cascaron y queda solo la hoja. Lo que dice del tratamiento depende del nivel
 * de detalle que el consultorio configuro; el backend ya resolvio esa regla y
 * aqui solo se pinta lo que llego.
 */

export interface Receipt {
  receipt_number: string;
  issued_at: string;
  kind: string;
  method: string;
  amount_cents: number;
  concept: string | null;
  patient_name: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  clinic_phone: string | null;
  clinic_license: string | null;
}

const moneyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeStyle: "short"
});

const KIND_LABELS: Record<string, string> = {
  PAYMENT: "Pago",
  DEPOSIT: "Anticipo",
  REFUND: "Reembolso"
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia"
};

export function Recibo({
  paymentId,
  onClose
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    call<Receipt>("build_receipt", { paymentId })
      .then((data) => {
        if (active) setReceipt(data);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [paymentId]);

  const isRefund = receipt?.kind === "REFUND";

  return (
    <dialog
      ref={dialogRef}
      className="receipt-dialog"
      aria-label={
        receipt ? `Recibo ${receipt.receipt_number}` : "Recibo"
      }
      onClose={onClose}
    >
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {receipt ? (
        <>
          <article className="receipt-sheet">
            <header className="receipt-head">
              <div>
                <strong className="receipt-clinic">
                  {receipt.clinic_name || "Consultorio"}
                </strong>
                {receipt.clinic_address ? (
                  <span className="receipt-meta">{receipt.clinic_address}</span>
                ) : null}
                <span className="receipt-meta">
                  {[receipt.clinic_phone, receipt.clinic_license]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="receipt-folio">
                <span className="receipt-meta">{isRefund ? "Reembolso" : "Recibo"}</span>
                <strong>{receipt.receipt_number}</strong>
              </div>
            </header>

            <dl className="receipt-rows">
              <div>
                <dt>Fecha</dt>
                <dd>{dateFormatter.format(new Date(receipt.issued_at))}</dd>
              </div>
              {receipt.patient_name ? (
                <div>
                  <dt>Paciente</dt>
                  <dd>{receipt.patient_name}</dd>
                </div>
              ) : null}
              {receipt.concept ? (
                <div>
                  <dt>Concepto</dt>
                  <dd>{receipt.concept}</dd>
                </div>
              ) : null}
              <div>
                <dt>Forma de pago</dt>
                <dd>{METHOD_LABELS[receipt.method] ?? receipt.method}</dd>
              </div>
            </dl>

            <p className="receipt-total">
              <span>{KIND_LABELS[receipt.kind] ?? receipt.kind}</span>
              <strong>{moneyFormatter.format(receipt.amount_cents / 100)}</strong>
            </p>

            <footer className="receipt-foot">
              Comprobante simple de {isRefund ? "devolución" : "pago"}. No es un
              comprobante fiscal digital (CFDI); si necesitas factura, solicítala en
              recepción.
            </footer>
          </article>

          <div className="receipt-actions">
            <button className="ghost-button" onClick={() => dialogRef.current?.close()}>
              Cerrar
            </button>
            <button className="action-button" onClick={() => window.print()}>
              Imprimir recibo
            </button>
          </div>
        </>
      ) : error ? null : (
        <p className="receipt-loading">Preparando el recibo…</p>
      )}
    </dialog>
  );
}
