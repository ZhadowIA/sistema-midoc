"use client";

import { TextArea } from "@/components/TextArea";
import type { NoteData } from "./useClinicalNote";

type Props = {
  note: NoteData;
  update: <K extends keyof NoteData>(key: K, value: NoteData[K]) => void;
  disabled?: boolean;
};

export function SoapSection({ note, update, disabled }: Props) {
  return (
    <div className="space-y-3">
      <TextArea
        label="Subjetivo"
        rows={3}
        value={note.subjective}
        onChange={(e) => update("subjective", e.target.value)}
        placeholder="Síntomas, antecedentes relevantes, contexto..."
        disabled={disabled}
      />
      <TextArea
        label="Objetivo"
        rows={3}
        value={note.objective}
        onChange={(e) => update("objective", e.target.value)}
        placeholder="Signos vitales, exploración, estudios..."
        disabled={disabled}
      />
      <TextArea
        label="Assessment (Dx)"
        rows={3}
        value={note.assessment}
        onChange={(e) => update("assessment", e.target.value)}
        placeholder="Diagnósticos probables, diferenciales, juicio clínico..."
        disabled={disabled}
      />
      <TextArea
        label="Plan"
        rows={3}
        value={note.plan}
        onChange={(e) => update("plan", e.target.value)}
        placeholder="Estudios, tratamiento, educación, seguimiento..."
        disabled={disabled}
      />
      <TextArea
        label="Notas privadas (no visibles para el paciente)"
        rows={2}
        value={note.privateNotes}
        onChange={(e) => update("privateNotes", e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
