"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Circle,
  User,
  Settings,
  Calendar,
  MessageSquare,
  Star,
  Rocket,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/Button";

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  hint: string;
  actionLabel: string;
  actionHref: string;
};

type SetupChecklist = {
  completed: number;
  total: number;
  progressPct: number;
  items: ChecklistItem[];
};

type StepGuide = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  details: string[];
  tip?: string;
};

const STEP_GUIDES: StepGuide[] = [
  {
    id: "profile_base",
    icon: User,
    title: "Perfil profesional base",
    description: "Tu nombre, teléfono y especialidad son lo primero que ven los pacientes.",
    details: [
      "Ve a Configuración → pestaña Perfil",
      "Asegúrate de que tu nombre completo esté correcto",
      "Agrega tu número de teléfono de consultorio",
      "Selecciona tu especialidad médica",
      "Guarda los cambios con el botón azul",
    ],
    tip: "El nombre que configures aparecerá en tu página pública de agenda.",
  },
  {
    id: "profile_branding",
    icon: Star,
    title: "Datos profesionales y branding",
    description: "Tu cédula, dirección y logo dan confianza a los pacientes y aparecen en recetas.",
    details: [
      "En la pestaña Perfil, completa tu cédula profesional",
      "Agrega la dirección completa de tu consultorio",
      "Sube tu logo o foto de consultorio (recomendado: 300×300 px)",
      "Opcionalmente agrega una foto de perfil tuya",
    ],
    tip: "El logo aparece en el encabezado de las notas clínicas y en tu página pública.",
  },
  {
    id: "pricing",
    icon: Settings,
    title: "Duración y precios de consulta",
    description: "Define cuánto dura cada consulta y cuánto cobras — esto genera tu agenda automáticamente.",
    details: [
      "Ve a Configuración → pestaña Parámetros",
      "Define la duración de consulta (entre 15 y 120 minutos)",
      "Ingresa el precio de consulta normal",
      "Si ofreces consultas extendidas, actívalas y pon su precio",
      "Configura los minutos de anticipación para recordatorios automáticos",
    ],
    tip: "Con la duración definida, el sistema divide tu disponibilidad en slots automáticamente.",
  },
  {
    id: "availability",
    icon: Calendar,
    title: "Agenda con disponibilidad activa",
    description: "Configura qué días y en qué horarios recibes pacientes.",
    details: [
      "Ve a Configuración → pestaña Disponibilidad",
      "Haz clic en '+ Agregar bloque' para cada horario",
      "Elige el día de la semana (o fecha específica)",
      "Define hora de inicio y hora de fin",
      "Activa 'Pública' para que los pacientes puedan ver y reservar ese horario",
    ],
    tip: "Puedes tener múltiples bloques por día. Por ejemplo: 9–13 h y 16–19 h.",
  },
  {
    id: "whatsapp",
    icon: MessageSquare,
    title: "WhatsApp para recordatorios",
    description: "Conectar WhatsApp reduce los no-shows hasta un 40% con recordatorios automáticos.",
    details: [
      "Ve a Configuración → pestaña WhatsApp",
      "Escanea el código QR con tu WhatsApp (igual que WhatsApp Web)",
      "Una vez conectado, define con cuántas horas de anticipación se envía el recordatorio",
      "Los pacientes recibirán confirmación y recordatorio automático",
    ],
    tip: "Este paso es opcional pero muy recomendado. Puedes conectarlo después de empezar a recibir citas.",
  },
];

// ─── Progress banner (shown on dashboard) ─────────────────────────────────────

export function OnboardingBanner({
  checklist,
  onOpen,
}: {
  checklist: SetupChecklist;
  onOpen: () => void;
}) {
  if (checklist.progressPct >= 100) return null;

  const pendingItems = checklist.items.filter((item) => !item.done);
  const firstPending = pendingItems[0];

  return (
    <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-primary/15 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
            <Rocket className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              Configura tu consultorio — {checklist.completed}/{checklist.total} pasos completados
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {firstPending
                ? `Siguiente: ${firstPending.label}`
                : "Casi listo — solo faltan unos detalles"}
            </p>
            {/* Progress bar */}
            <div className="mt-3 h-1.5 bg-primary/15 rounded-full w-64 max-w-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${checklist.progressPct}%` }}
              />
            </div>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onOpen}
          className="flex-shrink-0 whitespace-nowrap"
        >
          Iniciar tutorial
        </Button>
      </div>

      {/* Item dots */}
      <div className="mt-4 flex flex-wrap gap-2">
        {checklist.items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border ${
              item.done
                ? "bg-success/10 border-success/20 text-success"
                : "bg-background border-border text-muted-foreground"
            }`}
          >
            {item.done ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <Circle className="w-3 h-3" />
            )}
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Full wizard modal ────────────────────────────────────────────────────────

export function OnboardingWizard({
  checklist,
  open,
  onClose,
}: {
  checklist: SetupChecklist;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [activeStepIdx, setActiveStepIdx] = useState(() => {
    const firstPending = checklist.items.findIndex((item) => !item.done);
    return firstPending >= 0 ? firstPending : 0;
  });

  if (!open) return null;

  const steps = STEP_GUIDES.map((guide) => ({
    ...guide,
    done: checklist.items.find((item) => item.id === guide.id)?.done ?? false,
    actionLabel: checklist.items.find((item) => item.id === guide.id)?.actionLabel ?? "Configurar",
    actionHref: checklist.items.find((item) => item.id === guide.id)?.actionHref ?? "/medico/configuracion",
  }));

  const activeStep = steps[activeStepIdx];
  const canGoPrev = activeStepIdx > 0;
  const canGoNext = activeStepIdx < steps.length - 1;
  const allDone = checklist.progressPct >= 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Tutorial de configuración</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {checklist.completed}/{checklist.total} completados
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step tabs */}
        <div className="flex gap-1 px-6 pt-4 flex-shrink-0 overflow-x-auto">
          {steps.map((step, idx) => {
            const StepIcon = step.icon;
            const isActive = idx === activeStepIdx;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepIdx(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : step.done
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <StepIcon className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{step.title.split(" ")[0]}{step.title.split(" ")[1] ? " " + step.title.split(" ")[1] : ""}</span>
                <span className="sm:hidden">{idx + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Active step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {allDone ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">¡Todo listo!</h3>
                <p className="text-muted-foreground mt-1">
                  Tu consultorio está completamente configurado. Ya puedes recibir pacientes.
                </p>
              </div>
              <Button variant="primary" onClick={onClose}>
                Ir al dashboard
              </Button>
            </div>
          ) : (
            <div>
              {/* Step header */}
              <div className="flex items-start gap-4 mb-5">
                <div
                  className={`w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${
                    activeStep.done
                      ? "bg-success/10"
                      : "bg-primary/10"
                  }`}
                >
                  {activeStep.done ? (
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  ) : (
                    <activeStep.icon className="w-6 h-6 text-primary" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{activeStep.title}</h3>
                    {activeStep.done && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 font-medium">
                        Completado
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{activeStep.description}</p>
                </div>
              </div>

              {/* Step number badge */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
                  Paso {activeStepIdx + 1} de {steps.length}
                </span>
                {!activeStep.done && (
                  <span className="text-xs text-warning font-medium">Pendiente</span>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-secondary/30 rounded-md p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Cómo completar este paso
                </p>
                <ol className="space-y-2">
                  {activeStep.details.map((detail, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-foreground">
                      <span className="w-5 h-5 bg-primary/10 text-primary rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      {detail}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tip */}
              {activeStep.tip && (
                <div className="bg-primary/5 border border-primary/15 rounded-md p-3 mb-5">
                  <p className="text-xs text-primary">
                    <span className="font-semibold">Tip: </span>
                    {activeStep.tip}
                  </p>
                </div>
              )}

              {/* CTA */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(activeStep.actionHref);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                {activeStep.actionLabel}
              </button>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        {!allDone && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              onClick={() => setActiveStepIdx((i) => i - 1)}
              disabled={!canGoPrev}
              className="flex items-center gap-1.5 text-sm text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveStepIdx(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === activeStepIdx
                      ? "bg-primary w-5"
                      : steps[idx].done
                      ? "bg-success"
                      : "bg-border"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveStepIdx((i) => i + 1)}
              disabled={!canGoNext}
              className="flex items-center gap-1.5 text-sm text-muted-foreground disabled:opacity-30 hover:text-foreground transition-colors"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
