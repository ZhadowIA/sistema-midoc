"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type PrescriptionForm = {
  medication: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
};

export type NoteData = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  privateNotes: string;
  prescriptions: PrescriptionForm[];
};

type SaveState = "idle" | "saving" | "saved" | "error";

const EMPTY: NoteData = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  privateNotes: "",
  prescriptions: [],
};

const AUTOSAVE_MS = 2_500;

export function useClinicalNote(appointmentId: string) {
  const [note, setNote] = useState<NoteData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const firstChangeRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clinical/admin/appointments/${appointmentId}/note`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.error && data?.id) {
          setNote({
            subjective: data.subjective ?? "",
            objective: data.objective ?? "",
            assessment: data.assessment ?? "",
            plan: data.plan ?? "",
            privateNotes: data.privateNotes ?? "",
            prescriptions: Array.isArray(data.prescriptions) ? data.prescriptions : [],
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  const save = useCallback(
    async (next: NoteData) => {
      setSaveState("saving");
      const res = await fetch(
        `/api/clinical/admin/appointments/${appointmentId}/note`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveState("error");
        toast.error(body.error ?? "No se pudo guardar la nota");
        return;
      }
      setSaveState("saved");
    },
    [appointmentId],
  );

  useEffect(() => {
    if (!loaded) return;
    if (firstChangeRef.current) {
      firstChangeRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("idle");
    timerRef.current = setTimeout(() => {
      save(note);
    }, AUTOSAVE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [note, loaded, save]);

  const update = useCallback(
    <K extends keyof NoteData>(key: K, value: NoteData[K]) =>
      setNote((p) => ({ ...p, [key]: value })),
    [],
  );

  const addPrescription = useCallback(() => {
    setNote((p) => ({
      ...p,
      prescriptions: [
        ...p.prescriptions,
        { medication: "", dosage: "", frequency: "", duration: "", instructions: "" },
      ],
    }));
  }, []);

  const updatePrescription = useCallback(
    (index: number, key: keyof PrescriptionForm, value: string) => {
      setNote((p) => ({
        ...p,
        prescriptions: p.prescriptions.map((rx, i) =>
          i === index ? { ...rx, [key]: value } : rx,
        ),
      }));
    },
    [],
  );

  const removePrescription = useCallback((index: number) => {
    setNote((p) => ({
      ...p,
      prescriptions: p.prescriptions.filter((_, i) => i !== index),
    }));
  }, []);

  const soapCompletion = completionOf(note);

  return {
    note,
    loaded,
    saveState,
    saveNow: () => save(note),
    update,
    addPrescription,
    updatePrescription,
    removePrescription,
    soapCompletion,
  };
}

function completionOf(n: NoteData) {
  const pieces = [
    n.subjective.trim().length > 0,
    n.objective.trim().length > 0,
    n.assessment.trim().length > 0,
    n.plan.trim().length > 0,
  ];
  const filled = pieces.filter(Boolean).length;
  return Math.round((filled / pieces.length) * 100);
}
