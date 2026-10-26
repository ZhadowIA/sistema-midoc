//! Busca en el DOF las actualizaciones del CNIS publicadas despues de la ultima
//! revision (paso 33, etapa 6): `npm run cnis:check`.
//!
//! Recorre el indice de cada dia (edicion matutina y las demas del dia) desde
//! `checkedThrough` de `actualizaciones.json` hasta ayer, registra cada acuerdo
//! que actualiza el compendio con las claves de medicamento que menciona, y
//! guarda el archivo. Con `--ci` no escribe nada: termina con error si hay
//! actualizaciones pendientes, para que el aviso semanal se vea en rojo.
//! Solo lee paginas publicas del DOF; no envia nada.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  daysBetween,
  isCnisUpdate,
  isoDate,
  medicineKeys,
  mergeUpdates,
  otherEditions,
  parseDayIndex,
  pendingUpdates,
  validateState,
  type CnisUpdate,
  type UpdatesState
} from "./updates.ts";

const here = dirname(fileURLToPath(import.meta.url));
const statePath = join(here, "actualizaciones.json");
const ci = process.argv.includes("--ci");
const DOF = "https://dof.gob.mx";

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (MiDoc cnis check)" } });
      if (!response.ok) throw new Error(`${url} respondio ${response.status}`);
      // El DOF declara ISO-8859-1 en sus paginas.
      return new TextDecoder("latin1").decode(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

async function notesOfDay(day: string): Promise<{ codigo: string; fecha: string; title: string }[]> {
  const [year, month, date] = day.split("-");
  const base = `${DOF}/index.php?year=${year}&month=${month}&day=${date}`;
  const first = await fetchText(base);
  const pages = [first];
  for (const edition of otherEditions(first)) pages.push(await fetchText(`${base}&edicion=${edition}`));
  return pages.flatMap(parseDayIndex);
}

async function main(): Promise<void> {
  const state = validateState(JSON.parse(readFileSync(statePath, "utf8")) as UpdatesState);
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const days = daysBetween(state.checkedThrough, yesterday);
  console.log(`Revisando el DOF del ${days[0] ?? "-"} al ${days.at(-1) ?? "-"} (${days.length} dias)...`);

  const found: CnisUpdate[] = [];
  // Pocas peticiones a la vez: es un sitio publico.
  for (let i = 0; i < days.length; i += 4) {
    const batch = await Promise.all(days.slice(i, i + 4).map(notesOfDay));
    for (const note of batch.flat().filter(isCnisUpdate)) {
      const url = `${DOF}/nota_detalle.php?codigo=${note.codigo}&fecha=${note.fecha}`;
      found.push({
        date: isoDate(note.fecha),
        codigo: note.codigo,
        title: note.title,
        url,
        medicineKeys: medicineKeys(await fetchText(url)),
        status: "pendiente",
        reviewedBy: null,
        notes: ""
      });
    }
  }

  const next = mergeUpdates(state, found, days.at(-1) ?? state.checkedThrough);
  if (!ci) writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  const pending = pendingUpdates(next);
  console.log(`Nuevas: ${found.length}. Pendientes de aplicar: ${pending.length}.`);
  for (const update of pending) {
    console.log(`  ${update.date}  ${update.medicineKeys.length} claves de medicamento  ${update.url}`);
  }
  if (ci && pending.length > 0) {
    console.error("Hay actualizaciones del CNIS sin aplicar: ver V2/docs/MANTENIMIENTO_MEDICAMENTOS.md");
    process.exitCode = 1;
  }
}

await main();
