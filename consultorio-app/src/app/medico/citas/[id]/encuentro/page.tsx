"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Button } from "@/components/Button";
import { EncounterHistoryForm } from "@/components/clinical/EncounterHistoryForm";
import { PatientClinicalAlerts } from "@/components/clinical/PatientClinicalAlerts";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";

type ApiResponse = {
  record: {
    id: string | null;
    appointmentId: string;
    payload: EncounterHistoryPayload;
    completionPct: number;
    prefilledFromQuestionnaire: boolean;
  };
  built: boolean;
  patientId: string;
};

export default function EncounterPage(props: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const params = use(props.params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/appointments/${params.id}/encounter-history`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (payload: EncounterHistoryPayload) => {
    const res = await fetch(
      `/api/admin/appointments/${params.id}/encounter-history`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "No se pudo guardar");
      return;
    }
    toast.success("Encuentro guardado");
    await load();
  };

  const handlePrefill = async () => {
    setPrefilling(true);
    try {
      const res = await fetch(
        `/api/admin/appointments/${params.id}/encounter-history/prefill`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo prellenar");
        return;
      }
      toast.success("Prefill desde cuestionario aplicado");
      await load();
    } finally {
      setPrefilling(false);
    }
  };

  return (
    <DoctorLayout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => router.push(`/medico/citas/${params.id}`)}
          >
            <ArrowLeft className="w-4 h-4" /> Volver a la cita
          </Button>
          {data?.built && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrefill}
              loading={prefilling}
            >
              <Wand2 className="w-4 h-4" /> Prefill desde cuestionario
            </Button>
          )}
        </div>

        {data && <PatientClinicalAlerts patientId={data.patientId} />}

        {loading && <p className="text-muted-foreground">Cargando...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {data && (
          <EncounterHistoryForm
            initial={data.record.payload}
            completionPct={data.record.completionPct}
            onSave={handleSave}
          />
        )}
      </div>
    </DoctorLayout>
  );
}
