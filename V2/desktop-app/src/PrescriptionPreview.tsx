import { useEffect, useState } from "react";
import { call } from "./ipc";
import { addsInformation, genericLine, type PrescriptionItem } from "./prescriptionModel";

/**
 * Lo que la receta impresa y el FHIR agregan a lo que escribio el medico
 * (paso 33, etapa 4): la denominacion generica y la clave del CNIS. Se ve antes
 * de firmar; si algo no esta bien, el medico corrige su texto o su marca.
 */
export function PrescriptionPreview({ prescription, disabled }: { prescription: string; disabled: boolean }) {
  const [items, setItems] = useState<PrescriptionItem[]>([]);

  useEffect(() => {
    if (!prescription.trim()) {
      setItems([]);
      return;
    }
    const timer = setTimeout(() => {
      call<PrescriptionItem[]>("analyze_prescription", { prescription })
        .then(setItems)
        .catch(() => setItems([]));
    }, 700);
    return () => clearTimeout(timer);
  }, [prescription]);

  const shown = items.filter(addsInformation);
  if (shown.length === 0) return null;

  return (
    <section className="panel-plain">
      <h3>Así saldrá en la receta</h3>
      <p className="meta">
        Debajo de lo que escribiste, la receta impresa y el expediente FHIR agregan la denominación genérica y, cuando
        la coincidencia es exacta, la clave del Compendio Nacional de Insumos (CNIS). Lo que escribiste no cambia.
        {disabled ? null : " Si algo no corresponde, corrige el texto de la receta."}
      </p>
      <div className="stack">
        {shown.map((item, index) => (
          <p key={`${item.line}-${index}`}>
            <span className="meta">{item.line}</span>
            <br />
            {genericLine(item)}
          </p>
        ))}
      </div>
    </section>
  );
}
