"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Button } from "@/components/Button";
import { ClinicalHistoryForm } from "@/components/clinical/ClinicalHistoryForm";
import type { ClinicalHistoryPayload } from "@/lib/clinicalHistorySchema";

type ApiResponse = {
  record: {
    id: string | null;
    patientId: string;
    payload: ClinicalHistoryPayload;
    completionPct: number;
  };
  migrated: boolean;
};

export default function ClinicalHistoryPage(props: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const params = use(props.params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/patients/${params.id}/clinical-history`, {
        credentials: "include",
      });
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

  const handleSave = async (payload: ClinicalHistoryPayload) => {
    const res = await fetch(`/api/admin/patients/${params.id}/clinical-history`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "No se pudo guardar");
      return;
    }
    toast.success("Historia clínica guardada");
    await load();
  };

  return (
    <DoctorLayout>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => router.push(`/medico/pacientes/${params.id}`)}
          >
            <ArrowLeft className="w-4 h-4" /> Volver al paciente
          </Button>
          {data?.migrated && (
            <span className="text-xs text-amber-700 bg-amber-500/10 border border-amber-400/30 rounded-full px-3 py-1">
              Migrado desde expediente anterior — revisa y guarda.
            </span>
          )}
        </div>

        {loading && <p className="text-muted-foreground">Cargando...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {data && (
          <ClinicalHistoryForm
            initial={data.record.payload}
            completionPct={data.record.completionPct}
            onSave={handleSave}
          />
        )}
      </div>
    </DoctorLayout>
  );
}
