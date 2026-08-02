//! Encrypted local database (SQLCipher).
//!
//! All clinical data in MiDoc V2 lives in this database, on the doctor's
//! machine. The passphrase is handed to SQLCipher's PRAGMA key, which runs
//! its own PBKDF2-HMAC-SHA512 derivation with a per-database salt; we never
//! store the passphrase or a derived key on disk.

use rusqlite::Connection;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("la llave de cifrado es incorrecta o el archivo no es una base MiDoc")]
    InvalidKey,
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("error de E/S: {0}")]
    Io(#[from] std::io::Error),
}

/// Schema migrations, applied in order via `PRAGMA user_version`.
/// Forward-compatible only (REGLAS_DESARROLLO.md §6): each entry runs inside
/// a transaction and must never break an existing database.
const MIGRATIONS: &[&str] = &[
    // v1: bootstrap. Data-residency class: OPERATIVO.
    "CREATE TABLE app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    );
    INSERT INTO app_meta (key, value) VALUES ('created_with_schema', '1');",
    // v2: sincronizacion fase A (13_contrato_sincronizacion.md).
    // sync_state: OPERATIVO (token de dispositivo, cursor, servidor).
    // appointments: CONTACTO/OPERATIVO (datos de cita y contacto, no clinicos).
    // precheckins: CLINICO (vive solo aqui; la nube lo purga tras el ACK).
    "CREATE TABLE sync_state (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    );
    CREATE TABLE appointments (
        id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        scheduled_start TEXT NOT NULL,
        scheduled_end TEXT NOT NULL,
        service_name TEXT,
        reason TEXT,
        patient_id TEXT,
        patient_first_name TEXT NOT NULL DEFAULT '',
        patient_last_name TEXT NOT NULL DEFAULT '',
        patient_phone TEXT,
        patient_email TEXT,
        cancellation_reason TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_appointments_start ON appointments (scheduled_start);
    CREATE TABLE precheckins (
        appointment_id TEXT PRIMARY KEY NOT NULL,
        responses_json TEXT NOT NULL,
        received_at TEXT NOT NULL
    );",
    // v3: atencion clinica integrada (paso 4). Todo CLINICO: expediente,
    // encuentros, notas SOAP versionadas, recetas y auditoria local.
    // Nada de esto sale jamas de la base cifrada (regla de residencia 1).
    "CREATE TABLE patients (
        id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        phone TEXT,
        email TEXT,
        birth_date TEXT,
        sex TEXT,
        allergies TEXT,
        medical_background TEXT,
        family_background TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    INSERT INTO patients (id, first_name, last_name, phone, email, created_at, updated_at)
        SELECT patient_id, patient_first_name, patient_last_name,
               patient_phone, patient_email, updated_at, updated_at
        FROM appointments
        WHERE patient_id IS NOT NULL
        GROUP BY patient_id;
    CREATE TABLE encounters (
        id TEXT PRIMARY KEY NOT NULL,
        appointment_id TEXT,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at TEXT NOT NULL,
        signed_at TEXT,
        signed_hash TEXT
    );
    CREATE INDEX idx_encounters_patient ON encounters (patient_id);
    CREATE UNIQUE INDEX idx_encounters_appointment
        ON encounters (appointment_id) WHERE appointment_id IS NOT NULL;
    CREATE TABLE note_versions (
        encounter_id TEXT NOT NULL REFERENCES encounters (id),
        version INTEGER NOT NULL,
        subjective TEXT NOT NULL DEFAULT '',
        objective TEXT NOT NULL DEFAULT '',
        assessment TEXT NOT NULL DEFAULT '',
        plan TEXT NOT NULL DEFAULT '',
        diagnosis TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        PRIMARY KEY (encounter_id, version)
    );
    CREATE TABLE prescriptions (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters (id),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE clinical_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        at TEXT NOT NULL,
        details TEXT
    );",
    // v4: plantilla de especialidad (paso 5). Blob JSON opaco para Rust;
    // la estructura (medicina general/familiar, luego odontologia) vive en
    // el frontend. Se versiona y firma junto con la nota. Clase: CLINICO.
    "ALTER TABLE note_versions ADD COLUMN specialty_payload TEXT NOT NULL DEFAULT '{}';",
    // v5: documentos del buzon (paso 6, Fase B). Llegan cifrados de la nube,
    // se descifran con la llave del medico y se guardan aqui en claro. El id
    // es el del MailboxDocument en el portal (idempotencia ante re-entrega).
    // Clase: CLINICO (vive solo en este equipo).
    "CREATE TABLE documents (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT,
        appointment_id TEXT,
        file_name TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        category TEXT,
        content BLOB NOT NULL,
        size_bytes INTEGER NOT NULL,
        received_at TEXT NOT NULL
    );
    CREATE INDEX idx_documents_patient ON documents (patient_id);",
    // v6: operacion presencial (paso 10). Recepcion, lista de espera, consulta
    // sin cita, estados operativos, recursos fisicos, caja diaria, cobros,
    // recibos y anticipos. Clase: OPERATIVO — vive solo en este equipo y nunca
    // viaja a la nube. El dinero se guarda en centavos (enteros) para evitar
    // aritmetica de punto flotante.
    "CREATE TABLE resources (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'ROOM',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );
    -- Visita operativa: unifica la llegada de una cita agendada y la consulta
    -- sin cita (walk-in). appointment_id NULL = sin cita. encounter_id enlaza
    -- con el expediente clinico cuando inicia la consulta.
    CREATE TABLE visits (
        id TEXT PRIMARY KEY NOT NULL,
        appointment_id TEXT,
        patient_id TEXT,
        patient_name TEXT NOT NULL DEFAULT '',
        patient_phone TEXT,
        reason TEXT,
        service_name TEXT,
        state TEXT NOT NULL DEFAULT 'WAITING',
        priority INTEGER NOT NULL DEFAULT 0,
        resource_id TEXT REFERENCES resources (id),
        encounter_id TEXT,
        arrived_at TEXT NOT NULL,
        started_at TEXT,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_visits_state ON visits (state);
    CREATE INDEX idx_visits_arrived ON visits (arrived_at);
    CREATE UNIQUE INDEX idx_visits_appointment
        ON visits (appointment_id) WHERE appointment_id IS NOT NULL;
    -- Caja diaria: una sesion abierta a la vez (indice unico parcial).
    CREATE TABLE cash_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        opened_at TEXT NOT NULL,
        opening_float_cents INTEGER NOT NULL DEFAULT 0,
        closed_at TEXT,
        closing_counted_cents INTEGER,
        notes TEXT
    );
    CREATE UNIQUE INDEX idx_cash_sessions_open
        ON cash_sessions (closed_at) WHERE closed_at IS NULL;
    -- Cobros, anticipos (DEPOSIT) y reembolsos (REFUND). Cada cobro pertenece a
    -- la sesion de caja abierta y lleva un folio de recibo monotono.
    CREATE TABLE payments (
        id TEXT PRIMARY KEY NOT NULL,
        cash_session_id TEXT NOT NULL REFERENCES cash_sessions (id),
        visit_id TEXT REFERENCES visits (id),
        appointment_id TEXT,
        patient_id TEXT,
        amount_cents INTEGER NOT NULL,
        method TEXT NOT NULL DEFAULT 'CASH',
        kind TEXT NOT NULL DEFAULT 'PAYMENT',
        concept TEXT,
        receipt_number TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_payments_session ON payments (cash_session_id);
    CREATE UNIQUE INDEX idx_payments_receipt ON payments (receipt_number);",
    // v7: IA clinica gobernada (paso 11). El procesamiento de contenido clinico
    // con IA ocurre AQUI (residencia local): el contenido nunca sale a la nube
    // sin seudonimizacion y consentimiento. Toda salida de IA es BORRADOR hasta
    // que el medico la revisa y aprueba (regla: la IA no reemplaza el criterio
    // medico). Clase: CLINICO (input/output) + OPERATIVO (trazas de costo).
    //
    // ai_consents: consentimiento por paciente y alcance, con expiracion/revoca.
    // ai_runs: traza completa de cada ejecucion — proveedor, modelo, version de
    // prompt, costo, latencia, consentimiento, estado de revision y feedback.
    "CREATE TABLE ai_consents (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        scope TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        revoked_at TEXT
    );
    CREATE INDEX idx_ai_consents_patient ON ai_consents (patient_id, scope);
    CREATE TABLE ai_runs (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT REFERENCES encounters (id),
        patient_id TEXT REFERENCES patients (id),
        usage_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_version TEXT,
        prompt_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        input_redacted TEXT,
        output TEXT,
        estimated_cost_cents INTEGER,
        latency_ms INTEGER,
        consent_id TEXT REFERENCES ai_consents (id),
        feedback TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_ai_runs_encounter ON ai_runs (encounter_id);",
    // v8: benchmark clinico de IA (paso 11). Compara proveedores con casos
    // SIMULADOS (sin PHI) y documenta una decision. Clase: OPERATIVO — solo
    // local; nunca lleva contenido clinico real.
    "CREATE TABLE ai_benchmark_runs (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        case_count INTEGER NOT NULL,
        recommended_provider TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
    );
    CREATE TABLE ai_benchmark_results (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL REFERENCES ai_benchmark_runs (id),
        provider TEXT NOT NULL,
        success_count INTEGER NOT NULL,
        avg_latency_ms INTEGER NOT NULL,
        total_cost_cents INTEGER NOT NULL,
        completeness_pct INTEGER NOT NULL
    );
    CREATE INDEX idx_ai_benchmark_results_run ON ai_benchmark_results (run_id);",
    // v9: reporte de metadatos de uso IA al portal (paso 11). Marca local para
    // idempotencia de envio; el portal recibe solo referencias/costos, nunca
    // input_redacted ni output. Clase: OPERATIVO.
    "ALTER TABLE ai_runs ADD COLUMN usage_reported_at TEXT;
    CREATE INDEX idx_ai_runs_usage_reported ON ai_runs (usage_reported_at);",
    // v10: solicitudes ARCO (paso 12). El medico atiende ARCO localmente porque
    // los datos clinicos son suyos y residen en este equipo (decision del
    // inventario funcional). Registro de la solicitud y su atencion. Clase:
    // OPERATIVO — solo metadatos de la solicitud, sin contenido clinico. La
    // cancelacion (borrado) opera sobre el expediente clinico de forma separada.
    "CREATE TABLE arco_requests (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        request_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        notes TEXT,
        requested_at TEXT NOT NULL,
        fulfilled_at TEXT,
        result_summary TEXT
    );
    CREATE INDEX idx_arco_requests_patient ON arco_requests (patient_id);",
    // v11: linea del tiempo clinica por paciente (paso 13). Eventos relevantes
    // que el medico cura a mano (diagnosticos, hitos, alertas, etc.), separados
    // de las notas de consulta. CLINICO: vive solo en la base local cifrada, la
    // nube no lo conoce. `event_date` es la fecha clinica del evento (la captura
    // el medico); `created_at`/`updated_at` son de auditoria.
    "CREATE TABLE timeline_events (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        event_date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'NOTE',
        title TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_timeline_events_patient ON timeline_events (patient_id, event_date);",
    // v12: vinculo agenda -> expediente (paso 13). La agenda y el directorio
    // son independientes: una cita no crea automaticamente un expediente. Al
    // importar un paciente desde una cita, el medico puede vincular el id del
    // paciente del portal a un expediente local existente (porque el portal no
    // garantiza el mismo id para la misma persona). Este mapeo recuerda esa
    // decision para que la proxima cita de la misma persona se resuelva sola.
    // Clase: OPERATIVO (solo correlaciona identificadores, sin contenido clinico).
    "CREATE TABLE patient_links (
        portal_patient_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        linked_at TEXT NOT NULL
    );
    CREATE INDEX idx_patient_links_patient ON patient_links (patient_id);",
    // v13: seguridad de medicacion determinista (paso 14). Base de referencia
    // publica (farmacos, clases e interacciones) — clase REFERENCIA, no PHI: es
    // conocimiento clinico publico empaquetado, no datos del paciente. Las
    // verificaciones corren localmente sobre la prescripcion (CLINICO) y nunca
    // salen del equipo. En esta rebanada la base es un conjunto SEMBRADO
    // representativo de interacciones clinicas conocidas; la importacion real de
    // RxNorm/RxClass/DDInter/openFDA es una rebanada posterior.
    "CREATE TABLE medication_reference (
        name TEXT PRIMARY KEY NOT NULL,      -- nombre normalizado (minusculas) que se busca
        ingredient TEXT NOT NULL,            -- ingrediente canonico
        display_name TEXT NOT NULL,          -- nombre para mostrar
        drug_class TEXT                      -- clase terapeutica (duplicidad/alergia cruzada)
    );
    CREATE INDEX idx_medication_reference_ingredient ON medication_reference (ingredient);
    CREATE TABLE drug_interactions (
        ingredient_a TEXT NOT NULL,          -- orden canonico: a <= b
        ingredient_b TEXT NOT NULL,
        severity TEXT NOT NULL,              -- CONTRAINDICATED | MAJOR | MODERATE | MINOR
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        source_version TEXT NOT NULL,
        PRIMARY KEY (ingredient_a, ingredient_b)
    );
    INSERT INTO app_meta (key, value) VALUES ('medication_reference_version', 'seed-v1');
    INSERT INTO medication_reference (name, ingredient, display_name, drug_class) VALUES
        ('ibuprofeno','ibuprofeno','Ibuprofeno','AINE'),
        ('naproxeno','naproxeno','Naproxeno','AINE'),
        ('ketorolaco','ketorolaco','Ketorolaco','AINE'),
        ('aspirina','acido acetilsalicilico','Aspirina','AINE'),
        ('acido acetilsalicilico','acido acetilsalicilico','Acido acetilsalicilico','AINE'),
        ('warfarina','warfarina','Warfarina','Anticoagulante'),
        ('lisinopril','lisinopril','Lisinopril','IECA'),
        ('enalapril','enalapril','Enalapril','IECA'),
        ('losartan','losartan','Losartan','ARA II'),
        ('valsartan','valsartan','Valsartan','ARA II'),
        ('espironolactona','espironolactona','Espironolactona','Diuretico ahorrador de potasio'),
        ('sildenafil','sildenafil','Sildenafil','Inhibidor PDE5'),
        ('nitroglicerina','nitroglicerina','Nitroglicerina','Nitrato'),
        ('isosorbida','dinitrato de isosorbida','Dinitrato de isosorbida','Nitrato'),
        ('claritromicina','claritromicina','Claritromicina','Macrolido'),
        ('simvastatina','simvastatina','Simvastatina','Estatina'),
        ('atorvastatina','atorvastatina','Atorvastatina','Estatina'),
        ('tramadol','tramadol','Tramadol','Opioide'),
        ('fluoxetina','fluoxetina','Fluoxetina','ISRS'),
        ('sertralina','sertralina','Sertralina','ISRS'),
        ('litio','litio','Litio','Estabilizador del animo'),
        ('amoxicilina','amoxicilina','Amoxicilina','Penicilina'),
        ('ampicilina','ampicilina','Ampicilina','Penicilina'),
        ('omeprazol','omeprazol','Omeprazol','IBP'),
        ('pantoprazol','pantoprazol','Pantoprazol','IBP'),
        ('metformina','metformina','Metformina','Biguanida'),
        ('paracetamol','paracetamol','Paracetamol','Analgesico');
    INSERT INTO drug_interactions (ingredient_a, ingredient_b, severity, description, source, source_version) VALUES
        ('acido acetilsalicilico','warfarina','MAJOR','Mayor riesgo de sangrado por efecto antiagregante y anticoagulante combinado.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ibuprofeno','warfarina','MAJOR','Los AINE aumentan el riesgo de sangrado con warfarina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('naproxeno','warfarina','MAJOR','Los AINE aumentan el riesgo de sangrado con warfarina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ketorolaco','warfarina','MAJOR','Los AINE aumentan el riesgo de sangrado con warfarina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ibuprofeno','lisinopril','MODERATE','Los AINE reducen el efecto antihipertensivo y pueden afectar la funcion renal.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('enalapril','ibuprofeno','MODERATE','Los AINE reducen el efecto antihipertensivo y pueden afectar la funcion renal.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('espironolactona','lisinopril','MAJOR','Riesgo de hiperpotasemia por combinar IECA con ahorrador de potasio.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('enalapril','espironolactona','MAJOR','Riesgo de hiperpotasemia por combinar IECA con ahorrador de potasio.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('nitroglicerina','sildenafil','CONTRAINDICATED','Hipotension grave por combinar nitrato con inhibidor de PDE5.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('dinitrato de isosorbida','sildenafil','CONTRAINDICATED','Hipotension grave por combinar nitrato con inhibidor de PDE5.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('claritromicina','simvastatina','MAJOR','Riesgo de miopatia o rabdomiolisis por inhibir el metabolismo de la estatina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('fluoxetina','tramadol','MAJOR','Riesgo de sindrome serotoninergico y descenso del umbral convulsivo.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('sertralina','tramadol','MAJOR','Riesgo de sindrome serotoninergico y descenso del umbral convulsivo.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ibuprofeno','litio','MAJOR','Los AINE elevan los niveles de litio (riesgo de toxicidad).','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('litio','naproxeno','MAJOR','Los AINE elevan los niveles de litio (riesgo de toxicidad).','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1');",
    // v14: texto de etiqueta de openFDA como respaldo (paso 14, rebanada 4).
    // Cuando DDInter no tiene el par estructurado, se ofrece el texto de
    // interacciones de la etiqueta FDA del farmaco como evidencia informativa.
    // Clase REFERENCIA publica (no PHI); una fila por ingrediente.
    "CREATE TABLE drug_label_text (
        ingredient TEXT PRIMARY KEY NOT NULL,
        interactions_text TEXT NOT NULL,
        source TEXT NOT NULL,
        source_version TEXT NOT NULL
    );",
    // v15: responsable/tutor del paciente (paso 18, rebanada 2). Cuando se agenda
    // para otra persona/un menor, el responsable viaja en la cita como CONTACTO
    // (nunca clinico) y se conserva en el expediente como entidad propia, sin
    // mezclarse con la identidad del paciente. Tambien llega la fecha de
    // nacimiento del paciente capturada al agendar. Clase: CONTACTO/CLINICO.
    "ALTER TABLE appointments ADD COLUMN patient_birth_date TEXT;
    ALTER TABLE appointments ADD COLUMN guardian_name TEXT;
    ALTER TABLE appointments ADD COLUMN guardian_relationship TEXT;
    ALTER TABLE appointments ADD COLUMN guardian_phone TEXT;
    ALTER TABLE appointments ADD COLUMN guardian_email TEXT;
    ALTER TABLE patients ADD COLUMN guardian_name TEXT;
    ALTER TABLE patients ADD COLUMN guardian_relationship TEXT;
    ALTER TABLE patients ADD COLUMN guardian_phone TEXT;
    ALTER TABLE patients ADD COLUMN guardian_email TEXT;",
    // Antecedentes (paso 19, rebanada 7): distingue la preconsulta generica del
    // formulario de antecedentes (historia clinica), que llega sellado E2E.
    "ALTER TABLE precheckins ADD COLUMN kind TEXT NOT NULL DEFAULT 'generic';",
    // Historia clinica completa: la preconsulta guiada por IA y el formulario de
    // antecedentes son sobres distintos (kind) para la misma cita y ya no deben
    // pisarse. Se recrea `precheckins` con PK compuesta (appointment_id, kind)
    // para que ambos coexistan. SQLite no permite ALTER de PK: se recrea la tabla
    // preservando las filas existentes. Sigue siendo CLINICO (vive solo aqui).
    "CREATE TABLE precheckins_new (
        appointment_id TEXT NOT NULL,
        responses_json TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'generic',
        received_at TEXT NOT NULL,
        PRIMARY KEY (appointment_id, kind)
    );
    INSERT INTO precheckins_new (appointment_id, responses_json, kind, received_at)
        SELECT appointment_id, responses_json, kind, received_at FROM precheckins;
    DROP TABLE precheckins;
    ALTER TABLE precheckins_new RENAME TO precheckins;",
    // Historia clinica permanente y versionada por paciente. El cuestionario
    // recibido permanece inmutable en precheckins; cada conciliacion o edicion
    // del medico crea una version local nueva.
    "CREATE TABLE patient_medical_history_versions (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients(id),
        version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        source TEXT NOT NULL,
        encounter_id TEXT REFERENCES encounters(id),
        source_appointment_id TEXT,
        reconciled_source_hash TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(patient_id, version)
    );
    CREATE INDEX idx_patient_medical_history_latest
        ON patient_medical_history_versions(patient_id, version DESC);",
    // Transcripción corregida por el médico. CLINICO: solo SQLite cifrado local.
    "CREATE TABLE consultation_transcriptions (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters(id),
        run_id TEXT NOT NULL UNIQUE REFERENCES ai_runs(id),
        transcript_text TEXT NOT NULL,
        turns_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'REVIEWED',
        created_at TEXT NOT NULL,
        reviewed_at TEXT NOT NULL
    );
    CREATE INDEX idx_consultation_transcriptions_encounter
        ON consultation_transcriptions(encounter_id, reviewed_at DESC);",
    // Metadata del borrador de transcripcion en nube gobernada por el portal
    // (Ruta B, F3). Clase: CLINICO (segmentos) + OPERATIVO (modo/duracion/credito);
    // todo permanece en la base local cifrada, nunca sube al portal. `credit_cost`
    // es el cobro autoritativo que fijo el portal; `segments_json` guarda los
    // turnos anonimos crudos (speaker_0) antes de asignar roles (F4). Nullable
    // para que las filas existentes migren sin datos.
    "ALTER TABLE ai_runs ADD COLUMN transcription_mode TEXT;
    ALTER TABLE ai_runs ADD COLUMN duration_seconds INTEGER;
    ALTER TABLE ai_runs ADD COLUMN credit_cost INTEGER;
    ALTER TABLE ai_runs ADD COLUMN segments_json TEXT;",
    // Interacciones de TRES clases terapeuticas (paso 25): el "triple whammy"
    // (IECA/ARA2 + diuretico + AINE -> lesion renal aguda) no es expresable como
    // par. Se evalua por las CLASES presentes en la prescripcion. Clase
    // REFERENCIA publica (no PHI). Vacia hasta que se importe/instale la base.
    "CREATE TABLE class_triple_interactions (
        class_a TEXT NOT NULL,               -- orden canonico: a <= b <= c
        class_b TEXT NOT NULL,
        class_c TEXT NOT NULL,
        severity TEXT NOT NULL,              -- CONTRAINDICATED | MAJOR | MODERATE | MINOR
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        source_version TEXT NOT NULL,
        PRIMARY KEY (class_a, class_b, class_c)
    );",
    // Presupuestos dentales con saldos por avance (paso 26 rebanada 3). Clase
    // OPERATIVO: el dinero vive aqui, no en el payload clinico. Los abonos se
    // asientan en `payments` (caja del paso 10) via la columna nueva
    // `budget_id`: una sola contabilidad, sin movimientos duplicados.
    "CREATE TABLE dental_budgets (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        encounter_id TEXT,
        label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        discount_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        alternative_group TEXT,
        created_at TEXT NOT NULL,
        decided_at TEXT
    );
    CREATE INDEX idx_dental_budgets_patient ON dental_budgets (patient_id);
    CREATE TABLE dental_budget_items (
        id TEXT PRIMARY KEY NOT NULL,
        budget_id TEXT NOT NULL REFERENCES dental_budgets (id),
        tooth_id TEXT NOT NULL DEFAULT 'GENERAL',
        procedure TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PLANNED',
        completed_at TEXT
    );
    CREATE INDEX idx_dental_budget_items_budget ON dental_budget_items (budget_id);
    ALTER TABLE payments ADD COLUMN budget_id TEXT REFERENCES dental_budgets (id);",
    // Ordenes de laboratorio dental (paso 26 rebanada 4). Clase OPERATIVO:
    // el seguimiento de trabajos externos (corona, protesis, guarda) vive
    // local; el flujo es POR ENVIAR -> ENVIADA -> RECIBIDA -> ENTREGADA con
    // cancelacion antes de entregar, y fechas selladas por transicion.
    "CREATE TABLE dental_lab_orders (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        encounter_id TEXT,
        tooth_id TEXT NOT NULL DEFAULT 'GENERAL',
        work_type TEXT NOT NULL,
        lab_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        promised_at TEXT,
        sent_at TEXT,
        received_at TEXT,
        delivered_at TEXT,
        cost_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_dental_lab_orders_patient ON dental_lab_orders (patient_id);
    CREATE INDEX idx_dental_lab_orders_status ON dental_lab_orders (status);",
    // v24: identidad del paciente separada de lo clinico (paso 27, rebanada 1).
    // Clase CONTACTO: nombre, telefono, correo, fecha de nacimiento y sexo son
    // lo minimo para identificar a quien llega al mostrador, y son lo unico que
    // la estacion de recepcion necesita saber de un paciente. Lo clinico
    // (alergias, antecedentes) se queda en `patients`, clase CLINICO, y no
    // viajara nunca a la estacion operativa.
    //
    // Migracion en dos tiempos (expand/contract, regla 6 de
    // REGLAS_DESARROLLO.md): aqui solo se CREA y se POBLA. Las columnas de
    // identidad siguen en `patients` hasta que todos los lectores se muevan, y
    // se retiran en una migracion posterior. Asi una actualizacion a medias
    // nunca deja la base clinica sin identidad legible.
    "CREATE TABLE patient_identities (
        id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        phone TEXT,
        email TEXT,
        birth_date TEXT,
        sex TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_patient_identities_name
        ON patient_identities (last_name, first_name);
    INSERT INTO patient_identities
        (id, first_name, last_name, phone, email, birth_date, sex,
         created_at, updated_at)
        SELECT id, first_name, last_name, phone, email, birth_date, sex,
               created_at, updated_at
        FROM patients;",
    // v25: cierre del corte (paso 27, rebanada 1). Los lectores ya usan
    // `patient_identities`, asi que `patients` se queda solo con lo CLINICO y
    // el vinculo a la identidad. A partir de aqui la separacion es real: una
    // base sin `patients` sigue sabiendo a quien atender, y una copia de la
    // base operativa no contiene una sola linea de expediente.
    //
    // Se usa DROP COLUMN y NO la receta de recrear la tabla: nueve tablas
    // apuntan a patients(id), y recrearla exigiria apagar las llaves foraneas,
    // cosa que `PRAGMA foreign_keys` no puede hacer dentro de una transaccion
    // --seria un no-op silencioso y el DROP TABLE arrastraria el expediente--.
    // Ninguna de estas columnas esta indexada, que es la condicion que pide
    // SQLite para poder soltarlas.
    "ALTER TABLE patients DROP COLUMN first_name;
    ALTER TABLE patients DROP COLUMN last_name;
    ALTER TABLE patients DROP COLUMN phone;
    ALTER TABLE patients DROP COLUMN email;
    ALTER TABLE patients DROP COLUMN birth_date;
    ALTER TABLE patients DROP COLUMN sex;",
    // v26: el responsable/tutor es CONTACTO, no CLINICO (paso 27, rebanada 1).
    // Decision de clasificacion: `birth_date` ya vive en la identidad, asi que
    // recepcion ya sabe quien es menor de edad; el contacto del tutor no agrega
    // ninguna inferencia clinica nueva --es contacto de otra persona, la misma
    // clase que el telefono del paciente--. Dejarlo del lado clinico romperia
    // algo real: recepcion no podria llamar al tutor de un menor que llega solo.
    "ALTER TABLE patient_identities ADD COLUMN guardian_name TEXT;
    ALTER TABLE patient_identities ADD COLUMN guardian_relationship TEXT;
    ALTER TABLE patient_identities ADD COLUMN guardian_phone TEXT;
    ALTER TABLE patient_identities ADD COLUMN guardian_email TEXT;
    UPDATE patient_identities SET
        guardian_name = (SELECT p.guardian_name FROM patients p WHERE p.id = patient_identities.id),
        guardian_relationship = (SELECT p.guardian_relationship FROM patients p WHERE p.id = patient_identities.id),
        guardian_phone = (SELECT p.guardian_phone FROM patients p WHERE p.id = patient_identities.id),
        guardian_email = (SELECT p.guardian_email FROM patients p WHERE p.id = patient_identities.id);
    ALTER TABLE patients DROP COLUMN guardian_name;
    ALTER TABLE patients DROP COLUMN guardian_relationship;
    ALTER TABLE patients DROP COLUMN guardian_phone;
    ALTER TABLE patients DROP COLUMN guardian_email;",
    // v27: el cobro y su aplicacion dejan de ser la misma cosa (paso 27,
    // rebanada 1). Hasta aqui `payments.budget_id` significaba dos cosas a la
    // vez: se recibio este dinero, y este dinero se aplica al presupuesto B.
    // En cuanto el excedente es posible hay que partirlas, porque tienen
    // naturalezas opuestas:
    //
    //   payments            = HECHO. Dinero recibido, con folio. Inmutable:
    //                         un recibo emitido no se reescribe nunca.
    //   payment_allocations = DECISION contable. Como se reparte ese dinero.
    //                         Mutable y reversible.
    //
    // Lo no asignado ES el saldo a favor del paciente: no hace falta tabla ni
    // campo, se deriva de la diferencia. Y como solo las asignaciones se
    // recalculan, dos estaciones que cobran a la vez convergen sin coordinarse.
    //
    // `billable_items` es el extracto de cobro (clase FACTURABLE): lo minimo
    // que la estacion operativa necesita para cobrar un presupuesto sin poder
    // leer el expediente. La estacion clinica es su autoridad y lo empuja.
    // Con esto desaparece la unica arista dura que cruzaba la frontera
    // (payments.budget_id -> dental_budgets).
    "CREATE TABLE billable_items (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        concept TEXT NOT NULL,
        total_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_billable_items_patient ON billable_items (patient_id);
    INSERT INTO billable_items
        (id, patient_id, concept, total_cents, status, created_at, updated_at)
        SELECT b.id, b.patient_id, b.label,
               COALESCE((SELECT SUM(i.price_cents) FROM dental_budget_items i
                         WHERE i.budget_id = b.id), 0) - b.discount_cents,
               b.status, b.created_at, COALESCE(b.decided_at, b.created_at)
        FROM dental_budgets b;

    -- El vinculo se guarda aparte antes de recrear `payments`: la columna
    -- desaparece con la tabla vieja, y las asignaciones no pueden existir
    -- todavia porque apuntan a la tabla nueva.
    CREATE TABLE payment_budget_map AS
        SELECT id AS payment_id, budget_id, amount_cents, created_at
        FROM payments WHERE budget_id IS NOT NULL;

    CREATE TABLE payments_new (
        id TEXT PRIMARY KEY NOT NULL,
        cash_session_id TEXT NOT NULL REFERENCES cash_sessions (id),
        visit_id TEXT REFERENCES visits (id),
        appointment_id TEXT,
        patient_id TEXT,
        amount_cents INTEGER NOT NULL,
        method TEXT NOT NULL DEFAULT 'CASH',
        kind TEXT NOT NULL DEFAULT 'PAYMENT',
        concept TEXT,
        receipt_number TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    INSERT INTO payments_new
        (id, cash_session_id, visit_id, appointment_id, patient_id, amount_cents,
         method, kind, concept, receipt_number, created_at)
        SELECT id, cash_session_id, visit_id, appointment_id, patient_id, amount_cents,
               method, kind, concept, receipt_number, created_at
        FROM payments;
    DROP TABLE payments;
    ALTER TABLE payments_new RENAME TO payments;
    CREATE INDEX idx_payments_session ON payments (cash_session_id);
    CREATE UNIQUE INDEX idx_payments_receipt ON payments (receipt_number);

    CREATE TABLE payment_allocations (
        id TEXT PRIMARY KEY NOT NULL,
        payment_id TEXT NOT NULL REFERENCES payments (id),
        billable_id TEXT NOT NULL REFERENCES billable_items (id),
        amount_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_payment_allocations_payment ON payment_allocations (payment_id);
    CREATE INDEX idx_payment_allocations_billable ON payment_allocations (billable_id);
    -- Cada abono existente se vuelve una asignacion por su monto completo: la
    -- conducta no cambia, solo queda expresada en el modelo nuevo.
    INSERT INTO payment_allocations
        (id, payment_id, billable_id, amount_cents, created_at)
        SELECT payment_id, payment_id, budget_id, amount_cents, created_at
        FROM payment_budget_map;
    DROP TABLE payment_budget_map;",
    // v28: solicitud de reembolso del saldo a favor (paso 27, rebanada 1).
    //
    // El dinero que ENTRA es un hecho: cuando el sistema se entera ya ocurrio y
    // no se puede rechazar. El que SALE es una decision, y por eso admite una
    // compuerta sin mentirle a la contabilidad. De ahi que el reembolso sea la
    // unica operacion de caja que pide autorizacion del medico.
    //
    // Dos caminos, misma fila: con el medico presente la solicitud se autoriza
    // y se emite de corrido; con el medico ausente queda PENDING y no sale
    // dinero. En ESTACION_UNICA el medico es ambos actores y el flujo se
    // colapsa, pero la fila se escribe igual para que la bitacora sea uniforme
    // en los dos despliegues.
    //
    // `requested_by` y `authorized_by` quedan nulos hasta que la rebanada 2
    // traiga identidad de usuario; la columna existe desde ya para no volver a
    // migrar la tabla.
    "CREATE TABLE refund_requests (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        requested_by TEXT,
        requested_at TEXT NOT NULL,
        authorized_by TEXT,
        authorized_at TEXT,
        payment_id TEXT REFERENCES payments (id),
        resolved_at TEXT,
        expires_at TEXT NOT NULL
    );
    CREATE INDEX idx_refund_requests_status ON refund_requests (status);
    CREATE INDEX idx_refund_requests_patient ON refund_requests (patient_id);",
];

/// Opens (creating if needed) the encrypted database and applies pending
/// migrations. Fails with `DbError::InvalidKey` when the passphrase does not
/// match an existing database.
pub fn open_encrypted(path: &Path, passphrase: &str) -> Result<Connection, DbError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "key", passphrase)?;

    // First read against an encrypted database is the moment a wrong key
    // surfaces, as a NotADatabase error.
    let check = conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    });
    if let Err(err) = check {
        return match err.sqlite_error_code() {
            Some(rusqlite::ErrorCode::NotADatabase) => Err(DbError::InvalidKey),
            _ => Err(DbError::Sqlite(err)),
        };
    }

    conn.pragma_update(None, "foreign_keys", "ON")?;
    apply_migrations(&conn)?;
    Ok(conn)
}

pub fn schema_version(conn: &Connection) -> Result<i64, DbError> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Creates a consistent encrypted backup of the currently unlocked database.
///
/// SQLCipher applies the active connection key to the `VACUUM INTO` output, so
/// the backup remains unreadable without the same passphrase. The caller should
/// still store the file outside sync folders unless the doctor explicitly chose
/// that destination.
pub fn create_encrypted_backup(conn: &Connection, backup_path: &Path) -> Result<(), DbError> {
    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    if backup_path.exists() {
        std::fs::remove_file(backup_path)?;
    }

    let path = backup_path.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&path])?;
    Ok(())
}

fn apply_migrations(conn: &Connection) -> Result<(), DbError> {
    let current = schema_version(conn)?;
    for (idx, sql) in MIGRATIONS.iter().enumerate() {
        let target = (idx + 1) as i64;
        if current < target {
            conn.execute_batch(&format!(
                "BEGIN; {sql}; PRAGMA user_version = {target}; COMMIT;"
            ))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn temp_db_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("midoc-db-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn creates_encrypted_db_and_reads_back() {
        let path = temp_db_path("create");
        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('probe', 'hola')",
            [],
        )
        .unwrap();
        let value: String = conn
            .query_row("SELECT value FROM app_meta WHERE key = 'probe'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(value, "hola");
    }

    #[test]
    fn reopens_with_correct_key() {
        let path = temp_db_path("reopen");
        drop(open_encrypted(&path, "clave-correcta").unwrap());
        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        assert_eq!(schema_version(&conn).unwrap(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn rejects_wrong_key() {
        let path = temp_db_path("wrong-key");
        drop(open_encrypted(&path, "clave-correcta").unwrap());
        let err = open_encrypted(&path, "clave-incorrecta").unwrap_err();
        assert!(matches!(err, DbError::InvalidKey), "got: {err:?}");
    }

    #[test]
    fn migrations_are_idempotent() {
        let path = temp_db_path("idempotent");
        drop(open_encrypted(&path, "k").unwrap());
        let conn = open_encrypted(&path, "k").unwrap();
        assert_eq!(schema_version(&conn).unwrap(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn creates_local_reviewed_transcription_table() {
        let path = temp_db_path("reviewed-transcriptions");
        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('consultation_transcriptions')
                 WHERE name IN ('transcript_text', 'turns_json', 'reviewed_at')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn ai_runs_has_cloud_transcription_columns() {
        // Metadata del borrador de transcripcion en nube gobernada (Ruta B, F3):
        // modo, duracion autoritativa, credito y segmentos crudos del portal.
        let path = temp_db_path("cloud-tx-columns");
        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('ai_runs')
                 WHERE name IN ('transcription_mode', 'duration_seconds', 'credit_cost', 'segments_json')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 4);
    }

    #[test]
    fn patient_identities_holds_contact_columns_only() {
        // La identidad (CONTACTO) es lo unico que la estacion de recepcion
        // necesita; lo clinico no debe tener asiento en esta tabla.
        let path = temp_db_path("patient-identities-shape");
        let conn = open_encrypted(&path, "clave-correcta").unwrap();

        let contact: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('patient_identities')
                 WHERE name IN ('first_name', 'last_name', 'phone', 'email',
                                'birth_date', 'sex')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(contact, 6);

        let clinical: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('patient_identities')
                 WHERE name IN ('allergies', 'medical_background', 'family_background')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(clinical, 0, "lo clinico no cruza a la identidad");
    }

    #[test]
    fn v24_copies_identity_of_patients_already_captured() {
        // Regla 6: la migracion debe aplicar sobre una base existente, no solo
        // desde cero. Se arma una base en la version previa (23) con un
        // paciente ya capturado y se comprueba que al abrir queda su identidad.
        let path = temp_db_path("patient-identities-copy");
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "key", "clave-correcta").unwrap();
            for (idx, sql) in MIGRATIONS.iter().take(23).enumerate() {
                let target = (idx + 1) as i64;
                conn.execute_batch(&format!(
                    "BEGIN; {sql}; PRAGMA user_version = {target}; COMMIT;"
                ))
                .unwrap();
            }
            conn.execute(
                "INSERT INTO patients
                    (id, first_name, last_name, phone, email, birth_date, sex,
                     allergies, created_at, updated_at)
                 VALUES ('p1', 'Ana', 'Ruiz', '5551234567', 'ana@ejemplo.mx',
                         '1990-05-02', 'F', 'penicilina', '2026-07-01', '2026-07-01')",
                [],
            )
            .unwrap();
        }

        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        assert_eq!(schema_version(&conn).unwrap(), MIGRATIONS.len() as i64);

        let (first, last, phone, birth): (String, String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT first_name, last_name, phone, birth_date
                 FROM patient_identities WHERE id = 'p1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(first, "Ana");
        assert_eq!(last, "Ruiz");
        assert_eq!(phone.as_deref(), Some("5551234567"));
        assert_eq!(birth.as_deref(), Some("1990-05-02"));

        // Expand/contract: mientras los lectores se mueven, `patients` conserva
        // sus columnas y lo clinico sigue intacto.
        let allergies: Option<String> = conn
            .query_row(
                "SELECT allergies FROM patients WHERE id = 'p1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(allergies.as_deref(), Some("penicilina"));
    }

    #[test]
    fn patients_keeps_only_clinical_columns_after_v25() {
        // Cierre del corte: la identidad ya no vive en el expediente. Si alguna
        // de estas columnas vuelve a aparecer aqui, la frontera se erosiono.
        let path = temp_db_path("patients-clinical-only");
        let conn = open_encrypted(&path, "clave-correcta").unwrap();

        let identity_left: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('patients')
                 WHERE name IN ('first_name', 'last_name', 'phone', 'email',
                                'birth_date', 'sex', 'guardian_name',
                                'guardian_relationship', 'guardian_phone',
                                'guardian_email')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(identity_left, 0, "la identidad salio del expediente");

        let clinical: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('patients')
                 WHERE name IN ('allergies', 'medical_background', 'family_background')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(clinical, 3, "lo clinico se queda donde estaba");
    }

    #[test]
    fn v25_preserves_clinical_record_of_patients_already_captured() {
        // La migracion que suelta columnas es la que puede perder datos. Se
        // arma una base en la version previa (23) con expediente completo y se
        // comprueba que al abrir sobreviven identidad y antecedentes, cada uno
        // de su lado.
        let path = temp_db_path("v25-preserves");
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "key", "clave-correcta").unwrap();
            for (idx, sql) in MIGRATIONS.iter().take(23).enumerate() {
                let target = (idx + 1) as i64;
                conn.execute_batch(&format!(
                    "BEGIN; {sql}; PRAGMA user_version = {target}; COMMIT;"
                ))
                .unwrap();
            }
            conn.execute(
                "INSERT INTO patients
                    (id, first_name, last_name, phone, birth_date, allergies,
                     medical_background, guardian_name, guardian_phone,
                     created_at, updated_at)
                 VALUES ('p1', 'Hugo', 'Paz', '6141112222', '2018-03-04',
                         'penicilina', 'asma', 'Rosa Paz', '6143334444',
                         '2026-07-01', '2026-07-01')",
                [],
            )
            .unwrap();
        }

        let conn = open_encrypted(&path, "clave-correcta").unwrap();

        let (first, phone, birth): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT first_name, phone, birth_date FROM patient_identities WHERE id = 'p1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(first, "Hugo");
        assert_eq!(phone.as_deref(), Some("6141112222"));
        assert_eq!(birth.as_deref(), Some("2018-03-04"));

        let (allergies, background): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT allergies, medical_background FROM patients WHERE id = 'p1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(allergies.as_deref(), Some("penicilina"));
        assert_eq!(background.as_deref(), Some("asma"));

        // El tutor viaja con la identidad (v26): recepcion tiene que poder
        // llamarlo sin abrir el expediente.
        let (guardian, guardian_phone): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT guardian_name, guardian_phone FROM patient_identities WHERE id = 'p1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(guardian.as_deref(), Some("Rosa Paz"));
        assert_eq!(guardian_phone.as_deref(), Some("6143334444"));
    }

    #[test]
    fn file_on_disk_is_not_plaintext_sqlite() {
        let path = temp_db_path("ciphertext");
        drop(open_encrypted(&path, "clave-correcta").unwrap());
        let mut header = [0u8; 16];
        std::fs::File::open(&path)
            .unwrap()
            .read_exact(&mut header)
            .unwrap();
        assert_ne!(
            &header, b"SQLite format 3\0",
            "el archivo en disco no debe ser SQLite en claro"
        );
    }

    #[test]
    fn backup_is_encrypted_and_restorable_with_correct_key() {
        let path = temp_db_path("backup-source");
        let backup = temp_db_path("backup-copy");
        let _ = std::fs::remove_file(&backup);

        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('backup_probe', 'valor-clinico-local')",
            [],
        )
        .unwrap();

        create_encrypted_backup(&conn, &backup).unwrap();

        let restored = open_encrypted(&backup, "clave-correcta").unwrap();
        let value: String = restored
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'backup_probe'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(value, "valor-clinico-local");

        let mut header = [0u8; 16];
        std::fs::File::open(&backup)
            .unwrap()
            .read_exact(&mut header)
            .unwrap();
        assert_ne!(&header, b"SQLite format 3\0");
    }

    #[test]
    fn backup_rejects_wrong_restore_key() {
        let path = temp_db_path("backup-wrong-source");
        let backup = temp_db_path("backup-wrong-copy");
        let _ = std::fs::remove_file(&backup);

        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        create_encrypted_backup(&conn, &backup).unwrap();

        let err = open_encrypted(&backup, "clave-incorrecta").unwrap_err();
        assert!(matches!(err, DbError::InvalidKey), "got: {err:?}");
    }
}
