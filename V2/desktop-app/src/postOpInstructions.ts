import type { TreatmentPlanItem } from "./clinicalProfiles.ts";

// Indicaciones post-operatorias (paso 26 rebanada 5c): plantillas curadas en
// lenguaje llano por tipo de procedimiento, elegidas de forma DETERMINISTA a
// partir del plan de tratamiento. Sin IA: el contenido clinico es fijo y
// revisado; el dentista lo edita antes de entregarlo. La personalizacion con
// LLM queda en el asistente gobernado de "instrucciones al paciente" ya
// existente (paso 11).

export type PostOpKind =
  | "EXTRACTION"
  | "ENDODONTICS"
  | "RESTORATION"
  | "CROWN_PROSTHESIS"
  | "IMPLANT"
  | "SURGERY"
  | "CLEANING";

export const POST_OP_TEMPLATES: Record<PostOpKind, { label: string; text: string }> = {
  EXTRACTION: {
    label: "Extraccion",
    text: [
      "Despues de la extraccion:",
      "- Muerde la gasa por 30-45 minutos y cambiala si se empapa.",
      "- No escupas, no uses popote ni enjuagues con fuerza durante 24 horas.",
      "- No fumes ni tomes alcohol por al menos 72 horas.",
      "- Come frio y blando el primer dia; evita masticar del lado de la herida.",
      "- Aplica hielo por fuera en periodos de 15 minutos durante las primeras horas.",
      "- Toma el medicamento tal como se te receto.",
      "- Si el sangrado abundante, dolor intenso o fiebre persisten, contacta al consultorio."
    ].join("\n")
  },
  ENDODONTICS: {
    label: "Endodoncia",
    text: [
      "Despues de la endodoncia:",
      "- Evita masticar con ese diente hasta que se coloque la restauracion definitiva.",
      "- Es normal sentir molestia leve unos dias; toma el medicamento indicado.",
      "- Manten una higiene normal, con cuidado en la zona tratada.",
      "- Acude a tu cita para la restauracion definitiva: el diente queda fragil mientras tanto.",
      "- Si hay inflamacion, dolor creciente o fiebre, contacta al consultorio."
    ].join("\n")
  },
  RESTORATION: {
    label: "Restauracion (resina/amalgama)",
    text: [
      "Despues de la restauracion:",
      "- Evita comer hasta que pase el efecto de la anestesia para no morderte.",
      "- Puede haber sensibilidad al frio o calor unos dias; suele ceder sola.",
      "- Si sientes el punto de mordida alto o molestia al masticar, avisa para ajustarla.",
      "- Cepilla y usa hilo dental con normalidad."
    ].join("\n")
  },
  CROWN_PROSTHESIS: {
    label: "Corona / protesis",
    text: [
      "Cuidados de tu corona o protesis:",
      "- Con provisional: evita alimentos duros o pegajosos y mastica del otro lado.",
      "- Si el provisional se afloja o cae, guardalo y contacta al consultorio.",
      "- Con la definitiva: higiene normal, con especial cuidado del hilo dental en el margen.",
      "- Molestia leve al inicio es normal; si la mordida se siente alta, avisa para ajustar."
    ].join("\n")
  },
  IMPLANT: {
    label: "Implante",
    text: [
      "Despues de la cirugia de implante:",
      "- No toques la zona con la lengua ni los dedos; no levantes el labio para mirar.",
      "- Aplica hielo por fuera en periodos de 15 minutos el primer dia.",
      "- Dieta fria y blanda 48 horas; no fumes (compromete la cicatrizacion).",
      "- Toma antibiotico y analgesico exactamente como se receto.",
      "- A partir del segundo dia, enjuagues suaves con el antiseptico indicado.",
      "- Acude a tu cita de revision; si hay sangrado o dolor que aumenta, contacta al consultorio."
    ].join("\n")
  },
  SURGERY: {
    label: "Cirugia bucal / periodontal",
    text: [
      "Despues de la cirugia:",
      "- Reposo relativo el primer dia; evita esfuerzo fisico 72 horas.",
      "- Hielo local en periodos de 15 minutos durante las primeras horas.",
      "- Dieta fria y blanda; no fumes ni tomes alcohol durante la cicatrizacion.",
      "- No cepilles la zona operada hasta que se indique; usa el enjuague recetado.",
      "- Toma el medicamento tal como se receto y acude al retiro de puntos si aplica.",
      "- Ante sangrado abundante, fiebre o dolor creciente, contacta al consultorio."
    ].join("\n")
  },
  CLEANING: {
    label: "Limpieza / profilaxis",
    text: [
      "Despues de la limpieza:",
      "- Puede haber sensibilidad al frio unos dias; usa pasta desensibilizante si se indico.",
      "- Un ligero sangrado de encias al cepillar puede durar 1-2 dias.",
      "- Manten el cepillado 2-3 veces al dia y el hilo dental diario.",
      "- Evita cafe, vino tinto y tabaco unas horas para no manchar."
    ].join("\n")
  }
};

// Orden estable de presentacion.
export const POST_OP_KINDS: PostOpKind[] = [
  "EXTRACTION",
  "ENDODONTICS",
  "RESTORATION",
  "CROWN_PROSTHESIS",
  "IMPLANT",
  "SURGERY",
  "CLEANING"
];

const KIND_KEYWORDS: Array<[RegExp, PostOpKind]> = [
  [/extracc|extraer|exodonc/i, "EXTRACTION"],
  [/endodonc|conducto/i, "ENDODONTICS"],
  [/implante/i, "IMPLANT"],
  [/corona|protesis|puente|incrustacion|carilla/i, "CROWN_PROSTHESIS"],
  [/cirug|injerto|colgajo|frenilectom|apicectom/i, "SURGERY"],
  [/resina|amalgama|obtura|restaura|empaste|sellador|sellante/i, "RESTORATION"],
  [/limpieza|profilaxis|curetaje|raspado|detartraje/i, "CLEANING"]
];

// Sugiere plantillas segun el plan de tratamiento. Prioriza lo realizado o en
// progreso en esta sesion; si nada ha avanzado, considera todo el plan.
export function inferPostOpKinds(plan: TreatmentPlanItem[]): PostOpKind[] {
  const advanced = plan.filter(
    (item) => item.status === "COMPLETED" || item.status === "IN_PROGRESS"
  );
  const source = advanced.length > 0 ? advanced : plan;
  const kinds = new Set<PostOpKind>();
  for (const item of source) {
    for (const [pattern, kind] of KIND_KEYWORDS) {
      if (pattern.test(item.procedure)) {
        kinds.add(kind);
        break;
      }
    }
  }
  return POST_OP_KINDS.filter((kind) => kinds.has(kind));
}

export function composePostOpInstructions(kinds: PostOpKind[]): string {
  const unique = POST_OP_KINDS.filter((kind) => kinds.includes(kind));
  return unique.map((kind) => POST_OP_TEMPLATES[kind].text).join("\n\n");
}
