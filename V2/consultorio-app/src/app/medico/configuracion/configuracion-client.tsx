"use client";

import { useCallback, useEffect, useState } from "react";

const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado"
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

function ProfilePanel({
  workspace,
  onSaved
}: {
  workspace: Workspace;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
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
    isPublic: workspace.isPublic
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
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
      setSaved(true);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel">
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

        <div className="field">
          <label htmlFor="profile-specialty">Especialidad</label>
          <select
            id="profile-specialty"
            value={form.specialty}
            onChange={(event) =>
              update("specialty", event.currentTarget.value as typeof form.specialty)
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
          <label htmlFor="profile-phone">Telefono del consultorio</label>
          <input
            id="profile-phone"
            type="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.currentTarget.value)}
          />
        </div>

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
          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar perfil"}
          </button>
          {form.isPublic && form.publicSlug ? (
            <a className="ghost-button" href={`/perfil/${form.publicSlug}`}>
              Ver perfil publico
            </a>
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
    <article className="panel">
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
        <div className="field">
          <label htmlFor="service-name">Nombre del servicio</label>
          <input
            id="service-name"
            required
            placeholder="Consulta general"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.currentTarget.value }))
            }
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
            onChange={(event) =>
              setForm((current) => ({ ...current, price: event.currentTarget.value }))
            }
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
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                durationMinutes: event.currentTarget.value
              }))
            }
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

function AvailabilityPanel({
  workspace,
  onChanged
}: {
  workspace: Workspace;
  onChanged: () => void;
}) {
  const [ruleForm, setRuleForm] = useState({
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "14:00"
  });
  const [blockForm, setBlockForm] = useState({ date: "", startTime: "", endTime: "", reason: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function addRule() {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/admin/availability", {
        method: "POST",
        body: JSON.stringify({
          dayOfWeek: Number(ruleForm.dayOfWeek),
          startTime: ruleForm.startTime,
          endTime: ruleForm.endTime
        })
      });
      onChanged();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
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
    <article className="panel">
      <div className="panel-header">
        <h2>Horarios de atencion</h2>
        <p>
          Define tus horarios semanales. Los bloqueos apartan fechas concretas
          (vacaciones, congresos) sin borrar tu horario.
        </p>
      </div>

      {workspace.availabilityRules.length === 0 ? (
        <div className="empty-state">
          <strong>Sin horarios configurados</strong>
          <p>Agrega al menos un horario semanal para que tu agenda publica funcione.</p>
        </div>
      ) : (
        <div className="availability-list">
          {workspace.availabilityRules.map((rule) => (
            <div className="list-row" key={rule.id}>
              <div className="list-row-main">
                <strong>
                  {rule.ruleType === "WEEKLY" && rule.dayOfWeek !== null
                    ? DAY_NAMES[rule.dayOfWeek]
                    : rule.specificDate
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
      )}

      <form
        className="inline-form settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void addRule();
        }}
      >
        <div className="field">
          <label htmlFor="rule-day">Dia de la semana</label>
          <select
            id="rule-day"
            value={ruleForm.dayOfWeek}
            onChange={(event) =>
              setRuleForm((current) => ({ ...current, dayOfWeek: event.currentTarget.value }))
            }
          >
            {DAY_NAMES.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="rule-start">Desde</label>
          <input
            id="rule-start"
            type="time"
            required
            value={ruleForm.startTime}
            onChange={(event) =>
              setRuleForm((current) => ({ ...current, startTime: event.currentTarget.value }))
            }
          />
        </div>

        <div className="field">
          <label htmlFor="rule-end">Hasta</label>
          <input
            id="rule-end"
            type="time"
            required
            value={ruleForm.endTime}
            onChange={(event) =>
              setRuleForm((current) => ({ ...current, endTime: event.currentTarget.value }))
            }
          />
        </div>

        <div className="button-row field-full">
          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Agregando…" : "Agregar horario"}
          </button>
        </div>
      </form>

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
              onChange={(event) =>
                setBlockForm((current) => ({ ...current, date: event.currentTarget.value }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="block-start">Desde</label>
            <input
              id="block-start"
              type="time"
              required
              value={blockForm.startTime}
              onChange={(event) =>
                setBlockForm((current) => ({ ...current, startTime: event.currentTarget.value }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="block-end">Hasta</label>
            <input
              id="block-end"
              type="time"
              required
              value={blockForm.endTime}
              onChange={(event) =>
                setBlockForm((current) => ({ ...current, endTime: event.currentTarget.value }))
              }
            />
          </div>

          <div className="field">
            <label htmlFor="block-reason">Motivo (opcional)</label>
            <input
              id="block-reason"
              placeholder="Vacaciones"
              value={blockForm.reason}
              onChange={(event) =>
                setBlockForm((current) => ({ ...current, reason: event.currentTarget.value }))
              }
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

/* ---------- Pagina ---------- */

export function ConfiguracionClient() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState("");

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
  }, [load]);

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

  return (
    <section className="settings-stack">
      <ProfilePanel workspace={workspace} onSaved={load} />
      <ServicesPanel workspace={workspace} onChanged={load} />
      <AvailabilityPanel workspace={workspace} onChanged={load} />
    </section>
  );
}
