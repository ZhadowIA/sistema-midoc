import React from "react";
import { FeedbackState } from "../components/FeedbackState";
import { PageShell } from "../layout/PageShell";

export function ErrorStatesPage() {
  return (
    <PageShell
      title="Errores y feedback de sistema"
      subtitle="Colección de estados de error, vacío y recuperación con acciones claras para el usuario."
      eyebrow="Surface · Reliability"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FeedbackState type="error" title="404 · Página no encontrada" description="La ruta que intentaste abrir no existe." actionLabel="Ir al inicio" onAction={() => undefined} />
        <FeedbackState type="error" title="500 · Error del servidor" description="Ocurrió un problema inesperado. Intenta de nuevo." actionLabel="Reintentar" onAction={() => undefined} />
        <FeedbackState type="error" title="403 · Acceso denegado" description="No tienes permisos para acceder a este recurso." actionLabel="Solicitar acceso" onAction={() => undefined} />
        <FeedbackState type="error" title="429 · Demasiadas solicitudes" description="Espera unos segundos y vuelve a intentar." actionLabel="Reintentar" onAction={() => undefined} />
        <FeedbackState type="empty" title="Sin citas programadas" description="Comienza creando tu primera cita para hoy." actionLabel="Nueva cita" onAction={() => undefined} />
        <FeedbackState type="success" title="Cambio guardado" description="Tu configuración se guardó correctamente y ya está activa." actionLabel="Continuar" onAction={() => undefined} />
      </div>
    </PageShell>
  );
}
