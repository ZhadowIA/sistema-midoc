// Bandeja de la preconsulta configurable (paso 32, rebanada 3): coincidencias
// con el paciente de la consulta, busqueda y lectura de las respuestas. Logica
// pura, sin React, para probarla con node --test. Los datos llegan ya
// descifrados desde la base local (preconsulta_inbox.rs).

import type { PreconsultaQuestionnaire, QuestionType } from "./preconsultaQuestionnaire.ts";

/** "Prefiero no responder" (mismo valor que `lib/preconsulta-answers.ts` del portal). */
export const NO_ANSWER = "prefiero_no_responder";

export interface InboxItem {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  phone: string;
  first_visit: boolean;
  submitted_at: string;
  received_at: string;
  is_new: boolean;
}

export interface Inbox {
  items: InboxItem[];
  retention_days: number;
  retention_options: number[];
}

export interface StoredPreconsulta {
  id: string;
  envelope_json: string;
  questionnaire_json: string | null;
  submitted_at: string;
  attached_at: string | null;
}

/** Lo que la busqueda compara del paciente de la consulta. */
export interface PatientIdentity {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  phone: string | null;
}

export type MatchReason = "nombre" | "fecha de nacimiento" | "teléfono";

export interface InboxMatch {
  item: InboxItem;
  reasons: MatchReason[];
}

/** Sin acentos, minusculas y espacios simples: "  JOSÉ  María" -> "jose maria". */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Los ultimos 10 digitos: "+52 614 000 1111" y "6140001111" son el mismo. */
export function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function firstToken(value: string): string {
  return normalizeName(value).split(" ")[0] ?? "";
}

/**
 * Nombre parecido: coincide el primer nombre y el primer apellido, aunque
 * cambien acentos, mayusculas o falte el segundo nombre o apellido.
 */
function sameName(item: InboxItem, patient: PatientIdentity): boolean {
  const first = firstToken(item.first_name);
  const last = firstToken(item.last_name);
  return first !== "" && last !== "" && first === firstToken(patient.first_name) && last === firstToken(patient.last_name);
}

export function matchReasons(item: InboxItem, patient: PatientIdentity): MatchReason[] {
  const reasons: MatchReason[] = [];
  if (sameName(item, patient)) reasons.push("nombre");
  if (patient.birth_date && item.birth_date === patient.birth_date.slice(0, 10)) reasons.push("fecha de nacimiento");
  const phone = phoneKey(patient.phone);
  if (phone && phoneKey(item.phone) === phone) reasons.push("teléfono");
  return reasons;
}

/** Coincidencias con el paciente: mas datos en comun primero, luego la mas reciente. */
export function rankMatches(items: InboxItem[], patient: PatientIdentity): InboxMatch[] {
  return items
    .map((item) => ({ item, reasons: matchReasons(item, patient) }))
    .filter((match) => match.reasons.length > 0)
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length || b.item.submitted_at.localeCompare(a.item.submitted_at)
    );
}

/** Busqueda por nombre (todas las palabras, sin acentos) o por telefono. */
export function searchInbox(items: InboxItem[], query: string): InboxItem[] {
  const words = normalizeName(query).split(" ").filter(Boolean);
  const digits = query.replace(/\D/g, "");
  if (words.length === 0 && digits.length === 0) return items;
  return items.filter((item) => {
    const name = normalizeName(`${item.first_name} ${item.last_name}`);
    if (words.length > 0 && words.every((word) => name.includes(word))) return true;
    return digits.length >= 4 && item.phone.replace(/\D/g, "").includes(digits);
  });
}

export interface PreconsultaEnvelope {
  firstVisit: boolean;
  submittedAt: string;
  identity: { firstName: string; lastName: string; birthDate: string; phoneCountry: string; phone: string };
  changesSinceLastVisit?: string;
  medicalHistory?: Record<string, unknown>;
  answers: Record<string, string | string[]>;
}

export function parseEnvelope(json: string): PreconsultaEnvelope | null {
  try {
    const value = JSON.parse(json) as Partial<PreconsultaEnvelope>;
    if (!value || typeof value !== "object" || !value.identity || typeof value.answers !== "object") return null;
    return value as PreconsultaEnvelope;
  } catch {
    return null;
  }
}

export function parseQuestionnaire(json: string | null): PreconsultaQuestionnaire | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as PreconsultaQuestionnaire;
    return Array.isArray(value?.questions) ? value : null;
  } catch {
    return null;
  }
}

export interface AnswerRow {
  id: string;
  label: string;
  value: string;
}

function formatValue(value: string | string[], type: QuestionType | undefined): string {
  if (Array.isArray(value)) return value.map((item) => (item === NO_ANSWER ? "Prefiero no responder" : item)).join(", ");
  if (value === NO_ANSWER) return "Prefiero no responder";
  if (type === "yes_no") return value === "si" ? "Sí" : value === "no" ? "No" : value;
  if (type === "scale") return `${value} de 10`;
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateOnly(value);
  return value;
}

/** "1990-05-01" -> "01/05/1990" sin pasar por zonas horarias. */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/**
 * Respuestas en el orden del cuestionario contestado. Si la definicion ya no
 * esta (el medico la cambio antes de que llegara), se muestran con su clave.
 */
export function answerRows(
  envelope: PreconsultaEnvelope,
  questionnaire: PreconsultaQuestionnaire | null
): AnswerRow[] {
  const rows: AnswerRow[] = [];
  const seen = new Set<string>();
  for (const question of questionnaire?.questions ?? []) {
    const value = envelope.answers[question.id];
    if (value === undefined) continue;
    seen.add(question.id);
    rows.push({ id: question.id, label: question.label, value: formatValue(value, question.type) });
  }
  for (const [id, value] of Object.entries(envelope.answers)) {
    if (seen.has(id)) continue;
    rows.push({ id, label: id.replace(/_/g, " "), value: formatValue(value, undefined) });
  }
  return rows;
}

/** Texto que se agrega al Subjetivo cuando el medico lo pide. */
export function subjectiveText(envelope: PreconsultaEnvelope, rows: AnswerRow[]): string {
  const lines = [`Preconsulta del paciente (${formatDateOnly(envelope.submittedAt)}):`];
  for (const row of rows) lines.push(`- ${row.label}: ${row.value}`);
  const changes = envelope.changesSinceLastVisit?.trim();
  if (changes) lines.push(`- Cambios desde la última visita: ${changes}`);
  return lines.join("\n");
}

/** Enlace personal (rebanada 4) tal como lo guarda la app. */
export interface PersonalLink {
  url: string;
  created_at: string;
  expires_at: string;
  answered_at: string | null;
  attached: boolean;
}

export type PersonalLinkState = "none" | "waiting" | "expired" | "answered" | "attached";

/** En que va el enlace personal del paciente. */
export function personalLinkState(link: PersonalLink | null, now = new Date()): PersonalLinkState {
  if (!link) return "none";
  if (link.attached) return "attached";
  if (link.answered_at) return "answered";
  return new Date(link.expires_at).getTime() <= now.getTime() ? "expired" : "waiting";
}

/** Mensaje para el paciente con su enlace. */
export function personalLinkMessage(firstName: string, url: string): string {
  const name = firstName.trim().split(/\s+/)[0];
  return (
    `${name ? `Hola, ${name}. ` : ""}Antes de tu consulta, contesta tu preconsulta aquí ` +
    `(toma unos minutos y tus respuestas llegan cifradas a tu médico; el enlace es solo para ti y vence en 30 días): ${url}`
  );
}

/**
 * WhatsApp con el mensaje escrito. Con un telefono de 10 digitos se asume
 * Mexico (+52); sin telefono valido, WhatsApp pide elegir el contacto.
 */
export function whatsappUrl(phone: string | null, message: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const number = digits.length === 10 ? `52${digits}` : digits.length > 10 ? digits : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Agrega al final del Subjetivo sin pisar lo que ya escribio el medico. */
export function appendToSubjective(current: string, text: string): string {
  const trimmed = current.trimEnd();
  return trimmed ? `${trimmed}\n\n${text}` : text;
}
