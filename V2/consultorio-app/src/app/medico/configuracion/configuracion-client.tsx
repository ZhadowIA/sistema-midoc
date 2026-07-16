"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado"
];

// Zonas horarias de Mexico (IANA) cubriendo los husos del pais.
const TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: "America/Mexico_City", label: "Centro (Ciudad de Mexico, Guadalajara, Monterrey)" },
  { value: "America/Cancun", label: "Sureste (Cancun, Quintana Roo)" },
  { value: "America/Chihuahua", label: "Pacifico (Chihuahua)" },
  { value: "America/Mazatlan", label: "Pacifico (Mazatlan, Sinaloa, Nayarit)" },
  { value: "America/Hermosillo", label: "Pacifico sin horario de verano (Hermosillo, Sonora)" },
  { value: "America/Tijuana", label: "Noroeste (Tijuana, Baja California)" }
];

type Workspace = {
  professionalName: string;
  publicSlug: string;
  specialty: "GENERAL_MEDICINE" | "ODONTOLOGY";
  description: string | null;
  licenseNumber: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  consultationDuration: number;
  timeZone: string;
  isPublic: boolean;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    durationMinutes: number;
    status: "ACTIVE" | "INACTIVE";
  }>;
  availabilityRules: Array<{
    id: string;
    ruleType: "WEEKLY" | "DATE_OVERRIDE";
    dayOfWeek: number | null;
    specificDate: string | null;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>;
  availabilityBlocks: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
  galleryImages: Array<{
    id: string;
    url: string;
    caption: string | null;
    displayOrder: number;
  }>;
};

async function requestJson(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.location.href = "/medico/login";
    throw new Error("Sesion expirada.");
  }

  if (!response.ok) {
    throw new Error(data.error || "La operacion no se pudo completar.");
  }

  return data;
}

function formatPrice(priceCents: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency
  }).format(priceCents / 100);
}

/* ---------- Perfil ---------- */

function buildProfileForm(workspace: Workspace) {
  return {
    professionalName: workspace.professionalName,
    publicSlug: workspace.publicSlug,
    specialty: workspace.specialty,
    description: workspace.description ?? "",
    licenseNumber: workspace.licenseNumber ?? "",
    phone: workspace.phone ?? "",
    addressLine1: workspace.addressLine1 ?? "",
    city: workspace.city ?? "",
    state: workspace.state ?? "",
    consultationDuration: workspace.consultationDuration,
    timeZone: workspace.timeZone,
    isPublic: workspace.isPublic
  };
}

type ProfileForm = ReturnType<typeof buildProfileForm>;

function ProfilePanel({
  workspace,
  onSaved
}: {
  workspace: Workspace;
  onSaved: () => void;
}) {
  const [baseline, setBaseline] = useState<ProfileForm>(() => buildProfileForm(workspace));
  const [form, setForm] = useState<ProfileForm>(baseline);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline]
  );

  function update<K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await requestJson("/api/admin/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          description: form.description || null,
          licenseNumber: form.licenseNumber || null,
          phone: form.phone || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          state: form.state || null
        })
      });
      setBaseline(form);
      setSaved(true);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="settings-section">
      <div className="panel-header">
        <h2>Perfil publico</h2>
        <p>Lo que tus pacientes ven al agendar una cita contigo.</p>
      </div>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3 className="form-section-title field-full">Identidad profesional</h3>

        <div className="field">
          <label htmlFor="profile-name">Nombre profesional</label>
          <input
            id="profile-name"
            required
            value={form.professionalName}
            onChange={(event) => update("professionalName", event.currentTarget.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-specialty">Especialidad</label>
          <select
            id="profile-specialty"
            value={form.specialty}
            onChange={(event) =>
              update("specialty", event.currentTarget.value as ProfileForm["specialty"])
            }
          >
            <option value="GENERAL_MEDICINE">Medicina general / familiar</option>
            <option value="ODONTOLOGY">Odontologia</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="profile-license">Cedula profesional</label>
          <input
            id="profile-license"
            value={form.licenseNumber}
            onChange={(event) => update("licenseNumber", event.currentTarget.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-slug">Enlace publico</label>
          <input
            id="profile-slug"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            aria-describedby="profile-slug-hint"
            value={form.publicSlug}
            onChange={(event) => update("publicSlug", event.currentTarget.value)}
          />
          <p className="field-hint" id="profile-slug-hint">
            midoc.mx/perfil/{form.publicSlug || "tu-enlace"} · minusculas, numeros y guiones
          </p>
        </div>

        <div className="field field-full">
          <label htmlFor="profile-description">Descripcion para pacientes</label>
          <textarea
            id="profile-description"
            rows={3}
            maxLength={2000}
            value={form.description}
            onChange={(event) => update("description", event.currentTarget.value)}
          />
        </div>

        <h3 className="form-section-title field-full">Contacto y ubicacion</h3>

        <div className="field">
          <label htmlFor="profile-phone">Teléfono para pacientes</label>
          <input
            id="profile-phone"
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.currentTarget.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-address">Direccion</label>
          <input
            id="profile-address"
            value={form.addressLine1}
            onChange={(event) => update("addressLine1", event.currentTarget.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-city">Ciudad</label>
          <input
            id="profile-city"
            value={form.city}
            onChange={(event) => update("city", event.currentTarget.value)}
          />
        </div>

        <h3 className="form-section-title field-full">Agenda</h3>

        <div className="field">
          <label htmlFor="profile-duration">Duracion de consulta (minutos)</label>
          <input
            id="profile-duration"
            type="number"
            min={5}
            step={5}
            required
            value={form.consultationDuration}
            onChange={(event) =>
              update("consultationDuration", Number(event.currentTarget.value))
            }
          />
        </div>

        <div className="field">
          <label htmlFor="profile-timezone">Zona horaria</label>
          <select
            id="profile-timezone"
            value={form.timeZone}
            aria-describedby="profile-timezone-hint"
            onChange={(event) => update("timeZone", event.currentTarget.value)}
          >
            {TIME_ZONES.some((zone) => zone.value === form.timeZone) ? null : (
              <option value={form.timeZone}>{form.timeZone}</option>
            )}
            {TIME_ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
          <p className="field-hint" id="profile-timezone-hint">
            Tus horarios de atencion se interpretan en esta zona horaria.
          </p>
        </div>

        <div className="field field-full">
          <label className="check-label" htmlFor="profile-public">
            <input
              id="profile-public"
              type="checkbox"
              checked={form.isPublic}
              onChange={(event) => update("isPublic", event.currentTarget.checked)}
            />
            Mostrar mi perfil publicamente y aceptar citas en linea
          </label>
        </div>

        {error ? (
          <p className="form-error field-full" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="form-success field-full" role="status">
            Perfil guardado.
          </p>
        ) : null}

        <div className="button-row field-full">
          <button className="action-button" type="submit" disabled={busy || !dirty}>
            {busy ? "Guardando…" : "Guardar perfil"}
          </button>
          {dirty && !busy ? (
            <span className="unsaved-hint" role="status">
              Tienes cambios sin guardar
            </span>
          ) : null}
        </div>
      </form>
    </article>
  );
}

/* ---------- Servicios ---------- */

function ServicesPanel({
  workspace,
  onChanged
}: {
  workspace: Workspace;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({ name: "", price: "", durationMinutes: "30" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function addService() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/admin/services", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          priceCents: Math.round(Number(form.price) * 100),
          durationMinutes: Number(form.durationMinutes),
          displayOrder: workspace.services.length + 1
        })
      });
      setForm({ name: "", price: "", durationMinutes: "30" });
      onChanged();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleService(serviceId: string, status: "ACTIVE" | "INACTIVE") {
    setError("");
    try {
      await requestJson(`/api/admin/services/${serviceId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      onChanged();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "No se pudo actualizar."
      );
    }
  }

  return (
    <article className="settings-section">
      <div className="panel-header">
        <h2>Servicios</h2>
        <p>Los servicios activos aparecen en tu agenda publica con precio y duracion.</p>
      </div>

      {workspace.services.length === 0 ? (
        <div className="empty-state">
          <strong>Aun no tienes servicios</strong>
          <p>
            Agrega tu primer servicio (por ejemplo, &quot;Consulta general&quot;) para que
            tus pacientes puedan agendar.
          </p>
        </div>
      ) : (
        <div className="service-list">
          {workspace.services.map((service) => (
            <div className="list-row" key={service.id}>
              <div className="list-row-main">
                <strong>{service.name}</strong>
                <small>
                  {formatPrice(service.priceCents, service.currency)} ·{" "}
                  {service.durationMinutes} min
                </small>
              </div>
              <div className="row-actions">
                <span
                  className={service.status === "ACTIVE" ? "pill pill-success" : "pill pill-muted"}
                >
                  {service.status === "ACTIVE" ? "Activo" : "Inactivo"}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    void toggleService(
                      service.id,
                      service.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                    )
                  }
                >
                  {service.status === "ACTIVE" ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        className="inline-form settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void addService();
        }}
      >
        <h3 className="form-section-title field-full">Agregar servicio</h3>

        <div className="field">
          <label htmlFor="service-name">Nombre del servicio</label>
          <input
            id="service-name"
            required
            placeholder="Consulta general"
            value={form.name}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, name: value }));
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="service-price">Precio (MXN)</label>
          <input
            id="service-price"
            type="number"
            min={0}
            step="0.01"
            required
            placeholder="800"
            value={form.price}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, price: value }));
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="service-duration">Duracion (minutos)</label>
          <input
            id="service-duration"
            type="number"
            min={5}
            step={5}
            required
            value={form.durationMinutes}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, durationMinutes: value }));
            }}
          />
        </div>

        {error ? (
          <p className="form-error field-full" role="alert">
            {error}
          </p>
        ) : null}

        <div className="button-row field-full">
          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Agregando…" : "Agregar servicio"}
          </button>
        </div>
      </form>
    </article>
  );
}

/* ---------- Disponibilidad ---------- */

// Lunes primero: el orden natural de una semana laboral en Mexico.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const SCHEDULE_PRESETS: Array<{
  id: string;
  label: string;
  days: number[];
  ranges: Array<{ startTime: string; endTime: string }>;
}> = [
  {
    id: "manana",
    label: "Lun a Vie · 9:00 a 14:00",
    days: [1, 2, 3, 4, 5],
    ranges: [{ startTime: "09:00", endTime: "14:00" }]
  },
  {
    id: "doble-turno",
    label: "Lun a Vie · 9:00 a 14:00 y 16:00 a 20:00",
    days: [1, 2, 3, 4, 5],
    ranges: [
      { startTime: "09:00", endTime: "14:00" },
      { startTime: "16:00", endTime: "20:00" }
    ]
  },
  {
    id: "con-sabado",
    label: "Lun a Sab · 9:00 a 14:00",
    days: [1, 2, 3, 4, 5, 6],
    ranges: [{ startTime: "09:00", endTime: "14:00" }]
  }
];

function AvailabilityPanel({
  workspace,
  onChanged
}: {
  workspace: Workspace;
  onChanged: () => void;
}) {
  const [blockForm, setBlockForm] = useState({ date: "", startTime: "", endTime: "", reason: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ startTime: "09:00", endTime: "14:00" });
  const [copyDay, setCopyDay] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  const weeklyByDay = useMemo(() => {
    const map = new Map<number, Workspace["availabilityRules"]>();
    for (const rule of workspace.availabilityRules) {
      if (rule.ruleType === "WEEKLY" && rule.dayOfWeek !== null) {
        const list = map.get(rule.dayOfWeek) ?? [];
        list.push(rule);
        map.set(rule.dayOfWeek, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [workspace.availabilityRules]);

  const dateRules = workspace.availabilityRules.filter((rule) => rule.ruleType !== "WEEKLY");
  const weekIsEmpty = weeklyByDay.size === 0;

  async function createRules(
    rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>
  ) {
    setBusy(true);
    setError("");
    const results = await Promise.allSettled(
      rules.map((rule) =>
        requestJson("/api/admin/availability", {
          method: "POST",
          body: JSON.stringify(rule)
        })
      )
    );
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length === rules.length) {
      const reason = (failed[0] as PromiseRejectedResult).reason;
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el horario.");
    } else if (failed.length > 0) {
      setError(
        `Se guardaron ${rules.length - failed.length} de ${rules.length} rangos; el resto se solapa con horarios existentes.`
      );
    }
    setBusy(false);
    onChanged();
  }

  async function addRange(day: number) {
    await createRules([{ dayOfWeek: day, ...addForm }]);
    setAddingDay(null);
  }

  async function applyPreset(preset: (typeof SCHEDULE_PRESETS)[number]) {
    await createRules(
      preset.days.flatMap((day) =>
        preset.ranges.map((range) => ({ dayOfWeek: day, ...range }))
      )
    );
  }

  async function copyRanges() {
    if (copyDay === null || copyTargets.length === 0) return;
    const source = (weeklyByDay.get(copyDay) ?? []).map((rule) => ({
      startTime: rule.startTime,
      endTime: rule.endTime
    }));
    await createRules(
      copyTargets.flatMap((day) =>
        source.map((range) => ({ dayOfWeek: day, ...range }))
      )
    );
    setCopyDay(null);
    setCopyTargets([]);
  }

  async function toggleRule(ruleId: string, isActive: boolean) {
    setError("");
    try {
      await requestJson(`/api/admin/availability/${ruleId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive })
      });
      onChanged();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "No se pudo actualizar."
      );
    }
  }

  async function removeRule(ruleId: string) {
    setError("");
    try {
      await requestJson(`/api/admin/availability/${ruleId}`, { method: "DELETE" });
      onChanged();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "No se pudo eliminar."
      );
    }
  }

  async function addBlock() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/admin/availability/blocks", {
        method: "POST",
        body: JSON.stringify({
          startsAt: new Date(`${blockForm.date}T${blockForm.startTime}:00`).toISOString(),
          endsAt: new Date(`${blockForm.date}T${blockForm.endTime}:00`).toISOString(),
          reason: blockForm.reason || undefined
        })
      });
      setBlockForm({ date: "", startTime: "", endTime: "", reason: "" });
      onChanged();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(blockId: string) {
    setError("");
    try {
      await requestJson(`/api/admin/availability/blocks/${blockId}`, {
        method: "DELETE"
      });
      onChanged();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "No se pudo eliminar."
      );
    }
  }

  const blockFormatter = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <article className="settings-section">
      <div className="panel-header">
        <h2>Horarios de atencion</h2>
        <p>
          Agrega los rangos de cada dia que atiendes. Los bloqueos apartan fechas
          concretas (vacaciones, congresos) sin borrar tu horario.
        </p>
      </div>

      {weekIsEmpty ? (
        <div className="preset-box">
          <p className="preset-lead">Empieza con una plantilla y ajustala despues:</p>
          <div className="preset-row">
            {SCHEDULE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className="ghost-button"
                type="button"
                disabled={busy}
                onClick={() => void applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="week-editor">
        {WEEK_ORDER.map((day) => {
          const ranges = weeklyByDay.get(day) ?? [];
          return (
            <div className="week-day" key={day}>
              <div className="week-day-row">
                <span className={ranges.length ? "week-day-name" : "week-day-name is-off"}>
                  {DAY_NAMES[day]}
                </span>
                <div className="week-ranges">
                  {ranges.length === 0 ? (
                    <span className="week-off">Sin consulta</span>
                  ) : (
                    ranges.map((rule) => (
                      <span
                        className={rule.isActive ? "range-chip" : "range-chip is-paused"}
                        key={rule.id}
                      >
                        <span className="range-time">
                          {rule.startTime}–{rule.endTime}
                        </span>
                        {rule.isActive ? null : (
                          <span className="range-paused-tag">pausado</span>
                        )}
                        <button
                          type="button"
                          className="range-action"
                          onClick={() => void toggleRule(rule.id, !rule.isActive)}
                        >
                          {rule.isActive ? "Pausar" : "Reanudar"}
                        </button>
                        <button
                          type="button"
                          className="range-action range-remove"
                          aria-label={`Eliminar ${DAY_NAMES[day]} ${rule.startTime} a ${rule.endTime}`}
                          onClick={() => void removeRule(rule.id)}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="week-day-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setAddingDay((current) => (current === day ? null : day));
                      setCopyDay(null);
                    }}
                  >
                    + Rango
                  </button>
                  {ranges.length > 0 ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        setCopyDay((current) => (current === day ? null : day));
                        setCopyTargets([]);
                        setAddingDay(null);
                      }}
                    >
                      Copiar a…
                    </button>
                  ) : null}
                </div>
              </div>

              {addingDay === day ? (
                <form
                  className="week-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addRange(day);
                  }}
                >
                  <div className="field">
                    <label htmlFor={`range-start-${day}`}>Desde</label>
                    <input
                      id={`range-start-${day}`}
                      type="time"
                      required
                      value={addForm.startTime}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setAddForm((current) => ({ ...current, startTime: value }));
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`range-end-${day}`}>Hasta</label>
                    <input
                      id={`range-end-${day}`}
                      type="time"
                      required
                      value={addForm.endTime}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setAddForm((current) => ({ ...current, endTime: value }));
                      }}
                    />
                  </div>
                  <div className="button-row">
                    <button className="action-button" type="submit" disabled={busy}>
                      {busy ? "Agregando…" : "Agregar"}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setAddingDay(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : null}

              {copyDay === day ? (
                <div className="week-inline">
                  <span className="week-copy-label">
                    Copiar el horario de {DAY_NAMES[day].toLowerCase()} a:
                  </span>
                  <div className="day-chip-row">
                    {WEEK_ORDER.filter((target) => target !== day).map((target) => (
                      <label className="day-chip" key={target}>
                        <input
                          type="checkbox"
                          checked={copyTargets.includes(target)}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setCopyTargets((current) =>
                              checked
                                ? [...current, target]
                                : current.filter((value) => value !== target)
                            );
                          }}
                        />
                        {DAY_NAMES[target].slice(0, 3)}
                      </label>
                    ))}
                  </div>
                  <button
                    className="action-button"
                    type="button"
                    disabled={busy || copyTargets.length === 0}
                    onClick={() => void copyRanges()}
                  >
                    {busy ? "Copiando…" : "Copiar"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {dateRules.length > 0 ? (
        <div className="blocks-box">
          <h3>Fechas especificas</h3>
          <div className="availability-list" style={{ marginTop: 12 }}>
            {dateRules.map((rule) => (
              <div className="list-row" key={rule.id}>
                <div className="list-row-main">
                  <strong>
                    {rule.specificDate
                      ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(
                          new Date(rule.specificDate)
                        )
                      : "Fecha especifica"}
                  </strong>
                  <small>
                    {rule.startTime} a {rule.endTime}
                  </small>
                </div>
                <div className="row-actions">
                  <span className={rule.isActive ? "pill pill-success" : "pill pill-muted"}>
                    {rule.isActive ? "Activo" : "Pausado"}
                  </span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void toggleRule(rule.id, !rule.isActive)}
                  >
                    {rule.isActive ? "Pausar" : "Reanudar"}
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void removeRule(rule.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="blocks-box">
        <h3>Bloqueos de agenda</h3>

        {workspace.availabilityBlocks.length === 0 ? (
          <p className="field-hint">Sin bloqueos proximos.</p>
        ) : (
          <div className="availability-list" style={{ marginTop: 12 }}>
            {workspace.availabilityBlocks.map((block) => (
              <div className="list-row" key={block.id}>
                <div className="list-row-main">
                  <strong>
                    {blockFormatter.format(new Date(block.startsAt))} —{" "}
                    {blockFormatter.format(new Date(block.endsAt))}
                  </strong>
                  {block.reason ? <small>{block.reason}</small> : null}
                </div>
                <div className="row-actions">
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void removeBlock(block.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form
          className="inline-form settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addBlock();
          }}
        >
          <div className="field">
            <label htmlFor="block-date">Fecha</label>
            <input
              id="block-date"
              type="date"
              required
              value={blockForm.date}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBlockForm((current) => ({ ...current, date: value }));
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="block-start">Desde</label>
            <input
              id="block-start"
              type="time"
              required
              value={blockForm.startTime}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBlockForm((current) => ({ ...current, startTime: value }));
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="block-end">Hasta</label>
            <input
              id="block-end"
              type="time"
              required
              value={blockForm.endTime}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBlockForm((current) => ({ ...current, endTime: value }));
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="block-reason">Motivo (opcional)</label>
            <input
              id="block-reason"
              placeholder="Vacaciones"
              value={blockForm.reason}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBlockForm((current) => ({ ...current, reason: value }));
              }}
            />
          </div>

          <div className="button-row field-full">
            <button className="ghost-button" type="submit" disabled={busy}>
              Agregar bloqueo
            </button>
          </div>
        </form>
      </div>

      {error ? (
        <p className="form-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      ) : null}
    </article>
  );
}

/* ---------- Galeria ---------- */

function GalleryPanel({
  workspace,
  onChanged
}: {
  workspace: Workspace;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({ url: "", caption: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function addImage() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/admin/gallery", {
        method: "POST",
        body: JSON.stringify({
          url: form.url.trim(),
          caption: form.caption.trim() || null
        })
      });
      setForm({ url: "", caption: "" });
      onChanged();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo agregar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: string) {
    setError("");
    setPendingId(imageId);
    try {
      await requestJson(`/api/admin/gallery/${imageId}`, { method: "DELETE" });
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "No se pudo eliminar.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <article className="settings-section">
      <div className="panel-header">
        <h2>Galeria del consultorio</h2>
        <p>
          Fotos de tus instalaciones que se muestran en tu perfil publico. Pega la URL de
          una imagen (https) y, opcionalmente, un pie de foto. Hasta 12 imagenes.
        </p>
      </div>

      {workspace.galleryImages.length === 0 ? (
        <div className="empty-state">
          <strong>Tu galeria esta vacia</strong>
          <p>Agrega la primera foto de tu consultorio para que tus pacientes lo conozcan.</p>
        </div>
      ) : (
        <div className="gallery-admin-grid">
          {workspace.galleryImages.map((image) => (
            <figure className="gallery-admin-item" key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="gallery-admin-thumb"
                src={image.url}
                alt={image.caption ?? "Imagen del consultorio"}
                loading="lazy"
              />
              <figcaption className="gallery-admin-caption">
                {image.caption || <span className="field-hint">Sin pie de foto</span>}
              </figcaption>
              <button
                className="danger-button gallery-admin-remove"
                type="button"
                disabled={pendingId === image.id}
                onClick={() => void removeImage(image.id)}
              >
                {pendingId === image.id ? "Eliminando…" : "Eliminar"}
              </button>
            </figure>
          ))}
        </div>
      )}

      <form
        className="inline-form settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void addImage();
        }}
      >
        <h3 className="form-section-title field-full">Agregar imagen</h3>

        <div className="field field-full">
          <label htmlFor="gallery-url">URL de la imagen</label>
          <input
            id="gallery-url"
            type="url"
            required
            placeholder="https://…/foto-consultorio.jpg"
            value={form.url}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, url: value }));
            }}
          />
        </div>

        <div className="field field-full">
          <label htmlFor="gallery-caption">Pie de foto (opcional)</label>
          <input
            id="gallery-caption"
            maxLength={120}
            placeholder="Sala de espera"
            value={form.caption}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, caption: value }));
            }}
          />
        </div>

        {error ? (
          <p className="form-error field-full" role="alert">
            {error}
          </p>
        ) : null}

        <div className="button-row field-full">
          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Agregando…" : "Agregar imagen"}
          </button>
        </div>
      </form>
    </article>
  );
}

/* ---------- Pagina ---------- */

const TABS = [
  { id: "perfil", label: "Perfil" },
  { id: "servicios", label: "Servicios" },
  { id: "horarios", label: "Horarios" },
  { id: "galeria", label: "Galeria" }
] as const;

type TabId = (typeof TABS)[number]["id"];

function readTabFromHash(): TabId {
  if (typeof window === "undefined") return "perfil";
  const hash = window.location.hash.replace("#", "");
  return TABS.some((tab) => tab.id === hash) ? (hash as TabId) : "perfil";
}

export function ConfiguracionClient() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("perfil");

  const load = useCallback(() => {
    requestJson("/api/admin/profile")
      .then((data) => {
        setWorkspace(data.profile);
        setLoadError("");
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error ? error.message : "No se pudo cargar la configuracion."
        );
      });
  }, []);

  useEffect(() => {
    load();
    const onHashChange = () => setActiveTab(readTabFromHash());
    // Sincroniza con el hash tras hidratar (el servidor siempre renderiza "perfil").
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [load]);

  function selectTab(tab: TabId) {
    setActiveTab(tab);
    // Hash enlazable sin empujar entradas al historial en cada cambio de pestaña.
    window.history.replaceState(null, "", `#${tab}`);
  }

  if (loadError) {
    return (
      <section className="settings-stack">
        <p className="form-error" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  if (!workspace) {
    return (
      <section className="settings-stack" aria-busy="true" aria-label="Cargando configuracion">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </section>
    );
  }

  const activeServices = workspace.services.filter((s) => s.status === "ACTIVE").length;
  const activeRules = workspace.availabilityRules.filter((r) => r.isActive).length;
  const counts: Partial<Record<TabId, number>> = {
    servicios: activeServices,
    horarios: activeRules,
    galeria: workspace.galleryImages.length
  };

  return (
    <section className="settings-stack">
      <header className="settings-header">
        <div className="settings-header-main">
          <h1>Configuracion</h1>
          <p>Tu perfil publico, servicios y horarios en un solo lugar.</p>
        </div>
        <div className="settings-header-side">
          <span className={workspace.isPublic ? "pill pill-success" : "pill pill-muted"}>
            {workspace.isPublic ? "Perfil publico activo" : "Perfil oculto"}
          </span>
          {workspace.isPublic && workspace.publicSlug ? (
            <a className="ghost-button" href={`/perfil/${workspace.publicSlug}`}>
              Ver perfil publico
            </a>
          ) : null}
        </div>
      </header>

      <nav className="settings-tabs" aria-label="Secciones de configuracion">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="settings-tab"
            aria-current={activeTab === tab.id ? "true" : undefined}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
            {counts[tab.id] !== undefined ? (
              <span className="settings-tab-count">{counts[tab.id]}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {activeTab === "perfil" ? (
        <ProfilePanel workspace={workspace} onSaved={load} />
      ) : null}
      {activeTab === "servicios" ? (
        <ServicesPanel workspace={workspace} onChanged={load} />
      ) : null}
      {activeTab === "horarios" ? (
        <AvailabilityPanel workspace={workspace} onChanged={load} />
      ) : null}
      {activeTab === "galeria" ? (
        <GalleryPanel workspace={workspace} onChanged={load} />
      ) : null}
    </section>
  );
}
