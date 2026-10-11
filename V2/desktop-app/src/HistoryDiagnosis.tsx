import { historyDiagnosis, type HistoryEntry } from "./historyModel";

/** Diagnostico de un renglon del historial: texto libre y sus claves CIE-10. */
export function HistoryDiagnosis({ entry, strong = false }: { entry: HistoryEntry; strong?: boolean }) {
  const { text, codes } = historyDiagnosis(entry);
  return (
    <>
      {text ? strong ? <strong>{text}</strong> : <span>{text}</span> : null}
      {codes.length > 0 ? <span className="history-codes">{codes.join(" · ")}</span> : null}
    </>
  );
}
