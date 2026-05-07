"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Plus, Pencil, Power, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, LayoutGrid, List,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toast } from "sonner";

type ResourceType = "ROOM" | "EQUIPMENT" | "UNIT";

type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  notes: string | null;
  active: boolean;
};

type OccupancyAppointment = {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  appointmentType: string;
  patientName: string;
};

type ResourceOccupancy = Resource & { appointments: OccupancyAppointment[] };

const TYPE_LABEL: Record<ResourceType, string> = {
  ROOM: "Consultorio / Sala",
  EQUIPMENT: "Equipo",
  UNIT: "Unidad",
};

const TYPE_COLOR: Record<ResourceType, string> = {
  ROOM: "bg-blue-100 text-blue-800",
  EQUIPMENT: "bg-amber-100 text-amber-800",
  UNIT: "bg-purple-100 text-purple-800",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING:          "bg-yellow-100 text-yellow-800",
  CONFIRMED:        "bg-blue-100 text-blue-800",
  ARRIVED:          "bg-green-100 text-green-800",
  WAITING:          "bg-orange-100 text-orange-800",
  IN_CONSULTATION:  "bg-purple-100 text-purple-800",
  CHECKOUT_PENDING: "bg-indigo-100 text-indigo-800",
  COMPLETED:        "bg-gray-100 text-gray-600",
};

const EMPTY_FORM = { name: "", type: "ROOM" as ResourceType, notes: "" };

type Tab = "list" | "occupancy";

export default function RecursosPage() {
  const [tab, setTab] = useState<Tab>("list");

  // --- CRUD state ---
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // --- Occupancy state ---
  const [occupancyDate, setOccupancyDate] = useState(new Date());
  const [occupancy, setOccupancy] = useState<ResourceOccupancy[]>([]);
  const [loadingOccupancy, setLoadingOccupancy] = useState(false);

  const loadResources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/resources${showInactive ? "?includeInactive=true" : ""}`, {
        cache: "no-store",
      });
      const data = await res.json() as { resources?: Resource[]; error?: string };
      if (!res.ok) throw new Error(data.error);
      setResources(data.resources ?? []);
    } catch {
      toast.error("Error al cargar recursos");
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  const loadOccupancy = useCallback(async () => {
    setLoadingOccupancy(true);
    try {
      const dateStr = format(occupancyDate, "yyyy-MM-dd");
      const res = await fetch(`/api/admin/resources/occupancy?date=${dateStr}`, { cache: "no-store" });
      const data = await res.json() as { resources?: ResourceOccupancy[]; error?: string };
      if (!res.ok) throw new Error(data.error);
      setOccupancy(data.resources ?? []);
    } catch {
      toast.error("Error al cargar ocupación");
    } finally {
      setLoadingOccupancy(false);
    }
  }, [occupancyDate]);

  useEffect(() => { void loadResources(); }, [loadResources]);
  useEffect(() => {
    if (tab === "occupancy") void loadOccupancy();
  }, [tab, loadOccupancy]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (r: Resource) => { setEditingId(r.id); setForm({ name: r.name, type: r.type, notes: r.notes ?? "" }); setShowForm(true); };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const url = editingId ? `/api/admin/resources/${editingId}` : "/api/admin/resources";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error);
      toast.success(editingId ? "Recurso actualizado" : "Recurso creado");
      setShowForm(false); setEditingId(null);
      void loadResources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (r: Resource) => {
    try {
      const res = await fetch(`/api/admin/resources/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      if (!res.ok) throw new Error();
      toast.success(r.active ? "Recurso desactivado" : "Recurso activado");
      void loadResources();
    } catch { toast.error("Error al actualizar"); }
  };

  const handleDelete = async (r: Resource) => {
    if (!confirm(`¿Eliminar "${r.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/resources/${r.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string; deactivated?: boolean };
      if (!res.ok) throw new Error(data.error);
      toast.success(data.deactivated ? "Recurso desactivado (tiene citas asociadas)" : "Recurso eliminado");
      void loadResources();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error al eliminar"); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Recursos</h1>
            <p className="text-sm text-muted-foreground">Consultorios, equipos y unidades</p>
          </div>
          <div className="flex items-center gap-2">
            {tab === "list" && (
              <>
                <Button variant="secondary" onClick={() => setShowInactive(v => !v)}>
                  {showInactive ? "Ocultar inactivos" : "Ver inactivos"}
                </Button>
                <Button onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-2" /> Nuevo recurso
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === "list"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="w-4 h-4" /> Recursos
          </button>
          <button
            type="button"
            onClick={() => setTab("occupancy")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === "occupancy"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Ocupación por día
          </button>
        </div>

        {/* Tab: Lista de recursos */}
        {tab === "list" && (
          <>
            {showForm && (
              <div className="bg-card border border-border rounded-lg p-4 space-y-3 mb-6">
                <h3 className="font-medium text-foreground">{editingId ? "Editar recurso" : "Nuevo recurso"}</h3>
                <Input
                  label="Nombre"
                  placeholder="Consultorio 1, Ultrasonido, Sillón dental..."
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                <div className="space-y-1">
                  <label className="text-sm font-medium">Tipo</label>
                  <div className="flex gap-2 flex-wrap">
                    {(["ROOM", "EQUIPMENT", "UNIT"] as ResourceType[]).map(t => (
                      <button
                        key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          form.type === t
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-background hover:bg-secondary/30"
                        }`}
                      >
                        {TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  label="Notas (opcional)"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button onClick={handleSubmit} disabled={submitting || !form.name.trim()}>
                    {submitting ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-center text-muted-foreground py-8 animate-pulse">Cargando...</p>
            ) : resources.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sin recursos registrados.</p>
            ) : (
              <div className="space-y-2">
                {resources.map(r => (
                  <div
                    key={r.id}
                    className={`bg-card border rounded-md p-4 flex items-center gap-3 ${
                      r.active ? "border-border" : "border-border/40 opacity-60"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{r.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[r.type]}`}>
                          {TYPE_LABEL[r.type]}
                        </span>
                        {!r.active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactivo</span>
                        )}
                      </div>
                      {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(r)}
                        className="p-1.5 rounded-lg hover:bg-secondary/40 text-muted-foreground" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => toggleActive(r)}
                        className="p-1.5 rounded-lg hover:bg-secondary/40 text-muted-foreground"
                        title={r.active ? "Desactivar" : "Activar"}>
                        <Power className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(r)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab: Ocupación por día */}
        {tab === "occupancy" && (
          <>
            {/* Navegador de fecha */}
            <div className="flex items-center gap-2 mb-6">
              <Button variant="secondary" onClick={() => setOccupancyDate(d => subDays(d, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="secondary" onClick={() => setOccupancyDate(new Date())}>Hoy</Button>
              <Button variant="secondary" onClick={() => setOccupancyDate(d => addDays(d, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground capitalize ml-2">
                {format(occupancyDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
              </span>
              <Button variant="secondary" onClick={loadOccupancy} disabled={loadingOccupancy} className="ml-auto">
                <RefreshCw className={`w-4 h-4 ${loadingOccupancy ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {loadingOccupancy ? (
              <p className="text-center text-muted-foreground py-8 animate-pulse">Cargando ocupación...</p>
            ) : occupancy.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No tienes recursos activos registrados.</p>
            ) : (
              <div className="space-y-4">
                {occupancy.map(r => (
                  <div key={r.id} className="bg-card border border-border rounded-lg overflow-hidden">
                    {/* Encabezado del recurso */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/20">
                      <span className="font-semibold text-foreground">{r.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[r.type]}`}>
                        {TYPE_LABEL[r.type]}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.appointments.length === 0
                          ? "Disponible todo el día"
                          : `${r.appointments.length} cita${r.appointments.length > 1 ? "s" : ""}`}
                      </span>
                    </div>

                    {/* Citas del recurso */}
                    {r.appointments.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">Sin citas asignadas.</div>
                    ) : (
                      <div className="divide-y divide-border">
                        {r.appointments.map(apt => (
                          <div key={apt.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="text-sm font-medium text-foreground w-24 shrink-0">
                              {format(parseISO(apt.startTime), "HH:mm")} – {format(parseISO(apt.endTime), "HH:mm")}
                            </span>
                            <span className="text-sm text-foreground flex-1 truncate">{apt.patientName}</span>
                            <span className="text-xs text-muted-foreground">
                              {apt.appointmentType === "EXTENDED" ? "Extendida" : "Normal"}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[apt.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {apt.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
