import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { COMMAND_SCHEMAS, parseIpcResponse } from "./ipcSchemas.ts";
import { mockCall } from "./ipcMock.ts";

/** Comandos que `lib.rs` registra de verdad, leidos del codigo, no copiados. */
function registeredCommands(): string[] {
  const source = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  const start = source.indexOf("tauri::generate_handler![");
  assert.ok(start > 0, "lib.rs registra comandos con generate_handler!");
  const body = source.slice(start + "tauri::generate_handler![".length);
  return body
    .slice(0, body.indexOf("]"))
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

test("cada comando registrado declara el contrato de su respuesta", () => {
  const registered = registeredCommands();
  assert.ok(registered.length >= 100, "se esperaban los ~112 comandos");

  const sinContrato = registered.filter((name) => !COMMAND_SCHEMAS[name]);
  assert.deepEqual(sinContrato, [], "comandos sin esquema en ipcSchemas.ts");

  const sobrantes = Object.keys(COMMAND_SCHEMAS).filter((name) => !registered.includes(name));
  assert.deepEqual(sobrantes, [], "esquemas de comandos que ya no existen");
});

test("una respuesta sin contrato declarado se rechaza en vez de pasar", () => {
  assert.throws(
    () => parseIpcResponse("comando_inventado", { lo_que_sea: true }),
    /no declara el contrato/
  );
});

test("el error de validación no arrastra el contenido recibido", () => {
  // La respuesta trae contenido clinico y llega deforme. El mensaje que ve el
  // medico nombra el campo y el problema, nunca el dato (REGLAS §4.2).
  const deforme = {
    id: 42,
    patient_id: "pat-1",
    event_date: "2026-09-03",
    category: "DIAGNOSIS",
    title: "Hipertension arterial",
    detail: "Inicio de losartan 50mg",
    created_at: "2026-09-03",
    updated_at: "2026-09-03"
  };

  assert.throws(
    () => parseIpcResponse("add_timeline_event", deforme),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /add_timeline_event/);
      assert.match(message, /id: invalid_type/);
      assert.doesNotMatch(message, /Hipertension|losartan|pat-1/);
      return true;
    }
  );
});

test("los objetos son laxos: un campo no declarado sobrevive a la validación", () => {
  // Un esquema estricto de Zod 4 borraria las claves desconocidas y dejaria a
  // la UI sin datos que hoy lee. La validacion nunca puede quitar informacion.
  const conExtra = parseIpcResponse<Record<string, unknown>>("grant_access", {
    id: "u-1",
    name: "Recepción",
    role: "RECEPCION",
    campo_que_el_backend_agrego_despues: "sobrevive"
  });

  assert.equal(conExtra.campo_que_el_backend_agrego_despues, "sobrevive");
});

/**
 * Contrato contra el mock de navegador: se recorre cada comando que el mock
 * implementa y se valida su respuesta con el mismo esquema que protege al
 * backend real. Cubre las dos derivas que importan: un esquema equivocado y un
 * mock que dejo de parecerse a lo que devuelve Rust.
 */
test("el mock de navegador responde lo que declara el contrato", async () => {
  const args: Record<string, unknown> = {
    passphrase: "clave-de-prueba-larga",
    profileId: "default",
    displayName: "Dra. Prueba",
    appointmentId: "appt-1",
    patientId: "pat-1",
    encounterId: "enc-1",
    eventId: "tl-1",
    resourceId: "res-1",
    modelId: "small",
    usageType: "SOAP_DRAFT",
    input: "paracetamol",
    medications: ["paracetamol", "ibuprofeno"],
    search: "",
    firstName: "Ana",
    lastName: "Ruiz",
    phone: "6140001111",
    email: null,
    openingFloatCents: 50_000,
    countedCashCents: 50_000,
    budgetCents: 100_000,
    numSpeakers: 2,
    audio: [],
    turns: [],
    content: "Texto de prueba",
    note: {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      diagnosis: "",
      instructions: "",
      specialty: {}
    },
    event: { event_date: "2026-09-03", category: "DIAGNOSIS", title: "Control", detail: null },
    requestType: "ACCESO",
    status: "SENT",
    version: "prueba-v1",
    active: true,
    visitState: "WAITING",
    // Nombre y telefono que no coinciden con nadie sembrado: asi el alta no se
    // desvia al camino de "posible duplicado" y crea la visita directamente.
    walkIn: { patient_name: "Zoe Qa Prueba", patient_phone: "6149998877", reason: "Dolor" },
    patient: { first_name: "Ana", last_name: "Ruiz", phone: "6140001111" },
    resource: { name: "Consultorio 1", kind: "ROOM" },
    settings: { name: "Clinica", address: null, phone: null, license: null, receipt_detail: "GENERIC" },
    payment: {
      patient_id: "pat-1",
      amount_cents: 10_000,
      method: "CASH",
      kind: "PAYMENT",
      concept: "Consulta"
    },
    budget: {
      patient_id: "pat-1",
      encounter_id: null,
      label: "Plan de tratamiento",
      notes: null,
      discount_cents: 0,
      alternative_group: null,
      items: [{ tooth_id: "16", procedure: "Resina", price_cents: 80_000 }]
    },
    order: {
      patient_id: "pat-1",
      encounter_id: null,
      tooth_id: "16",
      work_type: "Corona",
      lab_name: "Laboratorio Central",
      promised_at: null,
      cost_cents: 50_000,
      notes: null
    },
    template: { name: "Plantilla", clinical_profile: "GENERAL_MEDICINE", segments: [] },
    prescription: "Paracetamol 500mg",
    background: { allergies: null, medical_background: null, family_background: null },
    mode: "standard"
  };

  // La sesion abierta, los consentimientos y una caja abierta desbloquean el
  // resto del mock; el alta de un paciente de paso da un `visitId` real.
  for (const preparacion of [
    "unlock_database",
    "ai_grant_consent",
    "ai_grant_voice_consent",
    "ai_grant_scribe_consent",
    "open_cash_session"
  ]) {
    await mockCall(preparacion, args).catch(() => undefined);
  }

  const alta = await mockCall<{ kind: string; visit?: { id: string } }>("register_walk_in", args);
  assert.equal(alta.kind, "visit", "el alta de prueba no debia pedir resolucion de duplicados");
  args.visitId = alta.visit?.id;

  // Una ayuda de texto deja una ejecucion de IA real que revisar despues.
  const borrador = await mockCall<{ run_id: string }>("ai_assist_text", args);
  args.runId = borrador.run_id;

  // Ids reales para los comandos que operan sobre algo ya existente. Sin esto
  // el mock devuelve `undefined` en vez de la entidad y el contrato falla por
  // una carencia de la prueba, no por deriva.
  const solicitud = await mockCall<{ id: string }>("arco_record_request", args);
  args.requestId = solicitud.id;

  const presupuesto = await mockCall<{ id: string; items: Array<{ id: string }> }>(
    "dental_create_budget",
    args
  );
  args.budgetId = presupuesto.id;
  args.itemId = presupuesto.items[0]?.id;

  const orden = await mockCall<{ id: string }>("dental_create_lab_order", args);
  args.orderId = orden.id;

  const cobro = await mockCall<{ id: string }>("register_payment", args);
  args.paymentId = cobro.id;

  const implementados = [...readFileSync(new URL("./ipcMock.ts", import.meta.url), "utf8").matchAll(/case "([a-z_0-9]+)"/g)].map(
    (match) => match[1]
  );
  assert.ok(implementados.length >= 90, "el mock deberia cubrir casi toda la superficie");

  const validados: string[] = [];
  const sinEstado: string[] = [];

  for (const command of [...new Set(implementados)]) {
    let raw: unknown;
    try {
      raw = await mockCall(command, args);
    } catch {
      // El barrido consume su propio estado: al pasar por `ai_revoke_consent`
      // o `close_cash_session` deja sin permiso o sin caja a los comandos que
      // vienen despues. Eso no es deriva de contrato; se anota y sigue.
      sinEstado.push(command);
      continue;
    }

    const schema = COMMAND_SCHEMAS[command];
    assert.ok(schema, `el mock implementa "${command}" pero no hay contrato`);
    const parsed = schema.safeParse(raw);
    assert.ok(
      parsed.success,
      `el mock de "${command}" no cumple su contrato: ${JSON.stringify(parsed.error?.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.code}`))}`
    );
    validados.push(command);
  }

  // Hoy se validan 85 de los 100 comandos del mock; el umbral deja holgura
  // para que un cambio del mock no vuelva roja la suite sin motivo, pero
  // sujeta la cobertura si alguien empieza a dejar comandos sin respuesta.
  assert.ok(
    validados.length >= 80,
    `solo se validaron ${validados.length} comandos (sin estado: ${sinEstado.join(", ")})`
  );
});
