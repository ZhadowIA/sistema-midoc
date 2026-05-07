"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { MedicalSpecialty } from "@prisma/client";
import type { SpecialtyPayload } from "@/lib/specialtyPayloadSchemas";

type SaveState = "idle" | "saving" | "saved" | "error";

type UseSpecialtyPayloadResult<T> = {
  data: T;
  loaded: boolean;
  saveState: SaveState;
  update: (next: T) => void;
};

export function useSpecialtyPayload<T>(
  encounterId: string,
  specialty: MedicalSpecialty,
  emptyValue: T,
): UseSpecialtyPayloadResult<T> {
  const [data, setData]         = useState<T>(emptyValue);
  const [loaded, setLoaded]     = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const latestRef   = useRef<T>(emptyValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clinical/admin/encounters/${encounterId}/specialty-payload`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.specialtyPayload?.specialty === specialty) {
          const incoming = json.specialtyPayload.data as T;
          setData(incoming);
          latestRef.current = incoming;
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [encounterId, specialty]);

  // ── Persist ───────────────────────────────────────────────────────────────
  const save = useCallback(
    async (payload: T) => {
      setSaveState("saving");
      try {
        const body: SpecialtyPayload = { specialty, data: payload } as SpecialtyPayload;
        const res = await fetch(
          `/api/clinical/admin/encounters/${encounterId}/specialty-payload`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) throw new Error("Error al guardar");
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
        toast.error("No se pudo guardar el módulo clínico");
      }
    },
    [encounterId, specialty],
  );

  const update = useCallback(
    (next: T) => {
      setData(next);
      latestRef.current = next;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(latestRef.current), 2500);
    },
    [save],
  );

  // Flush on unmount
  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        void save(latestRef.current);
      }
    },
    [save],
  );

  return { data, loaded, saveState, update };
}
