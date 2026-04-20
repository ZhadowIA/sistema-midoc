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
  versions: Array<{
    id: string;
    createdAt: string;
    status: string;
    completionPct: number;
    actorUserId: string | null;
  }>;
};

type VersionDetail = {
  id: string;
  createdAt: string;
  status: string;
  completionPct: number;
  actorUserId: string | null;
  payload: ClinicalHistoryPayload;
};

function summarizeVersion(payload: ClinicalHistoryPayload) {
  return {
    familyCount: Object.keys(payload.familyHistory ?? {}).length,
    nonPathCount: Object.keys(payload.nonPathologicalHistory ?? {}).length,
    pathCount: Object.keys(payload.pathologicalHistory ?? {}).length,
    agoCount: Object.keys(payload.gynecoObstetricHistory ?? {}).length,
    androCount: Object.keys(payload.andrologicHistory ?? {}).length,
    allergies: payload.allergies?.length ?? 0,
    meds: payload.currentMedications?.length ?? 0,
    alerts: payload.alerts?.length ?? 0,
  };
}

export default function ClinicalHistoryPage(props: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const params = use(props.params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedVersionPayload, setSelectedVersionPayload] = useState<ClinicalHistoryPayload | null>(null);

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

  useEffect(() => {
    if (!selectedVersionId) {
      setSelectedVersionPayload(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/patients/${params.id}/clinical-history/versions/${selectedVersionId}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "No se pudo cargar la versión");
        }
        return res.json();
      })
      .then((body: { version: VersionDetail }) => {
        if (!cancelled) setSelectedVersionPayload(body.version.payload);
      })
      .catch((e) => {
        if (!cancelled) {
          setSelectedVersionPayload(null);
          toast.error(e instanceof Error ? e.message : "No se pudo cargar la versión");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, selectedVersionId]);

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
          <>
            {(() => {
              const selected = selectedVersionId
                ? data.versions.find((version) => version.id === selectedVersionId)
                : null;
              const summary = summarizeVersion(selectedVersionPayload ?? data.record.payload);
              return (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground">
                      Resumen clínico {selected ? "de versión seleccionada" : "actual"}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {selected ? `Versión ${selected.status}` : "Última versión"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">AHF</p>
                      <p className="font-semibold">{summary.familyCount}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">APNP</p>
                      <p className="font-semibold">{summary.nonPathCount}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">APP</p>
                      <p className="font-semibold">{summary.pathCount}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">Alertas</p>
                      <p className="font-semibold">{summary.alerts}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">Alergias</p>
                      <p className="font-semibold">{summary.allergies}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">Meds crónicos</p>
                      <p className="font-semibold">{summary.meds}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">AGO</p>
                      <p className="font-semibold">{summary.agoCount}</p>
                    </div>
                    <div className="rounded-lg border border-border p-2 text-xs">
                      <p className="text-muted-foreground">Andrológico</p>
                      <p className="font-semibold">{summary.androCount}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Versionado clínico</h2>
                <span className="text-xs text-muted-foreground">
                  {data.versions.length} versiones registradas
                </span>
              </div>
              {data.versions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Aún no hay versiones previas guardadas.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {data.versions.map((version, index) => (
                    <li key={version.id} className="py-2.5 text-sm flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          Versión {data.versions.length - index} · {version.status}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString("es-MX", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                          {version.completionPct}% completo
                        </span>
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() =>
                            setSelectedVersionId((current) =>
                              current === version.id ? null : version.id,
                            )
                          }
                        >
                          {selectedVersionId === version.id ? "Ocultar" : "Ver"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedVersionId && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">Versión histórica (solo lectura)</h3>
                <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-secondary/40 p-3 text-xs text-foreground">
                  {JSON.stringify(
                    selectedVersionPayload ?? {},
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}

            <ClinicalHistoryForm
              initial={data.record.payload}
              completionPct={data.record.completionPct}
              onSave={handleSave}
            />
          </>
        )}
      </div>
    </DoctorLayout>
  );
}
