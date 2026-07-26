// Configuración de la Estación Clínica: el menú lateral queda en cuatro
// destinos de trabajo (Agenda, Pacientes, Recepción y caja, Configuración) y
// todo lo que es ajuste —tema, servicios y precios, transcripción, referencia de
// medicamentos, ARCO y el banco de pruebas de IA— vive dentro de Configuración.
// Aquí solo el modelo de secciones, sin React, para poder probarlo.

export type ConfiguracionSectionId =
  | "apariencia"
  | "servicios"
  | "transcripcion"
  | "medicamentos"
  | "arco"
  | "benchmark";

export interface ConfiguracionSection {
  id: ConfiguracionSectionId;
  label: string;
  description: string;
}

// Orden de lectura: primero lo que el médico cambia a diario (apariencia y su
// oferta comercial), después las herramientas y al final el cumplimiento.
const ALL_SECTIONS: readonly ConfiguracionSection[] = [
  {
    id: "apariencia",
    label: "Apariencia",
    description: "Tema claro u oscuro para esta computadora."
  },
  {
    id: "servicios",
    label: "Servicios y precios",
    description: "Servicios, precios y preconsulta se editan en tu portal."
  },
  {
    id: "transcripcion",
    label: "Transcripción",
    description: "Modelo de dictado y micrófono."
  },
  {
    id: "medicamentos",
    label: "Medicamentos",
    description: "Catálogo local de referencia."
  },
  {
    id: "arco",
    label: "Privacidad (ARCO)",
    description: "Solicitudes de acceso, rectificación, cancelación y oposición."
  },
  {
    id: "benchmark",
    label: "Benchmark IA",
    description: "Pruebas de calidad de los proveedores de IA."
  }
];

// "Servicios y precios" abre el portal en el navegador: sin URL de servidor no
// hay nada que abrir, así que la sección no se ofrece.
export function configuracionSections(options: {
  canOpenPortal: boolean;
}): ConfiguracionSection[] {
  return ALL_SECTIONS.filter((section) =>
    section.id === "servicios" ? options.canOpenPortal : true
  );
}

// La sección visible siempre debe existir en la lista disponible; si el vínculo
// con el portal cambia mientras el médico está en "Servicios", cae a la primera.
export function resolveConfiguracionSection(
  current: ConfiguracionSectionId,
  available: readonly ConfiguracionSection[]
): ConfiguracionSectionId {
  if (available.some((section) => section.id === current)) {
    return current;
  }
  return available[0]?.id ?? "apariencia";
}
