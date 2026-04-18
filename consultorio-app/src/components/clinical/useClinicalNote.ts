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

export type SignResult =
  | { ok: true }
  | { ok: false; error: string; missing?: string[] };

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
  const [signedAt, setSignedAt] = useState<string | null>(null);
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
          setSignedAt(data.signedAt ?? null);
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
          method: "POST",
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

  const sign = useCallback(async (): Promise<SignResult> => {
    setSaveState("saving");
    const res = await fetch(
      `/api/clinical/admin/appointments/${appointmentId}/note`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...note, sign: true }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveState("error");
      return {
        ok: false,
        error: body.error ?? "No se pudo firmar la nota",
        missing: Array.isArray(body.missing) ? body.missing : undefined,
      };
    }
    setSaveState("saved");
    setSignedAt(body?.signedAt ?? new Date().toISOString());
    return { ok: true };
  }, [appointmentId, note]);

  useEffect(() => {
    if (!loaded) return;
    if (signedAt) return;
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
  }, [note, loaded, signedAt, save]);

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

  const applySoapPartial = useCallback(
    (soap: Partial<Pick<NoteData, "subjective" | "objective" | "assessment" | "plan">>) => {
      const IGNORED = "No se menciona en la consulta";
      setNote((p) => ({
        ...p,
        subjective:
          soap.subjective && soap.subjective !== IGNORED ? soap.subjective : p.subjective,
        objective:
          soap.objective && soap.objective !== IGNORED ? soap.objective : p.objective,
        assessment:
          soap.assessment && soap.assessment !== IGNORED ? soap.assessment : p.assessment,
        plan: soap.plan && soap.plan !== IGNORED ? soap.plan : p.plan,
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
    signedAt,
    isSigned: Boolean(signedAt),
    saveNow: () => save(note),
    sign,
    update,
    addPrescription,
    updatePrescription,
    removePrescription,
    applySoapPartial,
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
