/**
 * Alcance del producto (reenfoque 2026-09-07, `14_reenfoque_expediente_ia.md`).
 *
 * MiDoc es un expediente clinico con apoyo IA. La agenda, la recepcion, la caja
 * y los saldos del presupuesto dental quedan congelados tras una bandera de
 * capacidad apagada por omision: no se borran, desaparecen de la navegacion y
 * de la UI. Encenderla (`VITE_MIDOC_FROZEN_SCOPE=on` al compilar) devuelve todo
 * a como estaba antes del reenfoque.
 *
 * Este modulo es puro (sin `import.meta`) para poder probarlo con `node --test`;
 * la lectura de la variable de entorno vive en `App.tsx`.
 */

export type WorkspaceView =
  | "agenda"
  | "patients"
  | "search"
  | "reception"
  | "transcription"
  | "medications"
  | "arco"
  | "benchmark"
  | "doctor-data";

export interface NavItem {
  id: WorkspaceView;
  label: string;
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

/** Vistas que solo existen con el alcance congelado encendido. */
const FROZEN_VIEWS: ReadonlySet<WorkspaceView> = new Set(["agenda", "reception"]);

export function parseFrozenScopeFlag(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "on";
}

export function isViewAvailable(view: WorkspaceView, frozenScope: boolean): boolean {
  return frozenScope || !FROZEN_VIEWS.has(view);
}

/** La app abre en Pacientes; la Agenda solo es la entrada con el alcance congelado. */
export function defaultView(frozenScope: boolean): WorkspaceView {
  return frozenScope ? "agenda" : "patients";
}

export function workspaceNav(frozenScope: boolean): NavSection[] {
  const sections: NavSection[] = [
    {
      heading: "Clínica",
      items: [
        { id: "agenda", label: "Agenda" },
        { id: "patients", label: "Pacientes" },
        { id: "search", label: "Búsqueda" }
      ]
    },
    {
      heading: frozenScope ? "Operación" : "Herramientas",
      items: [
        { id: "reception", label: "Recepción y caja" },
        { id: "transcription", label: "Transcripción" },
        { id: "medications", label: "Medicamentos" }
      ]
    },
    {
      heading: "Cumplimiento",
      items: [
        { id: "arco", label: "Privacidad (ARCO)" },
        { id: "benchmark", label: "Benchmark IA" }
      ]
    },
    {
      heading: "Cuenta",
      items: [{ id: "doctor-data", label: "Mis datos" }]
    }
  ];

  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => isViewAvailable(item.id, frozenScope))
  }));
}
