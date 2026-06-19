# Permanent Medical History Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los cuatro antecedentes resumidos por historia clínica completa, permanente y versionada, con conciliación campo por campo antes de editar.

**Architecture:** SQLite guardará versiones inmutables por paciente y conservará los precheckins originales. TypeScript normalizará y fusionará los payloads, mostrando solo conflictos con información en ambas versiones; un editor desktop reutilizará el contrato espejo del formulario público.

**Tech Stack:** Tauri 2, Rust, SQLCipher/SQLite, React 19, TypeScript, CSS, Node test runner.

---

## Estructura

- Modificar `V2/desktop-app/src-tauri/src/db.rs`: migración de versiones permanentes.
- Modificar `V2/desktop-app/src-tauri/src/clinical.rs`: lectura, guardado, versionado y auditoría.
- Modificar `V2/desktop-app/src-tauri/src/lib.rs`: comandos IPC.
- Modificar `V2/desktop-app/src/ipc.ts`: implementación mock.
- Modificar `V2/desktop-app/src/medicalHistoryFormat.ts`: exportar contrato editable completo.
- Crear `V2/desktop-app/src/medicalHistoryReconciliation.ts`: normalización, fusión y conflictos.
- Crear `V2/desktop-app/src/medicalHistoryReconciliation.test.ts`: regresiones de conciliación.
- Crear `V2/desktop-app/src/MedicalHistoryEditor.tsx`: formulario completo.
- Crear `V2/desktop-app/src/MedicalHistoryReconciliation.tsx`: comparación en dos columnas.
- Modificar `V2/desktop-app/src/Atencion.tsx`: flujo y eliminación de campos legados.
- Modificar `V2/desktop-app/src/App.css`: estilos.
- Modificar `V2/desktop-app/package.json`: incluir ambas pruebas TypeScript.

### Task 1: Persistencia versionada

**Files:**
- Modify: `V2/desktop-app/src-tauri/src/db.rs`
- Modify: `V2/desktop-app/src-tauri/src/clinical.rs`
- Modify: `V2/desktop-app/src-tauri/src/lib.rs`

- [ ] **Step 1: Escribir pruebas Rust rojas**

Crear pruebas que:

```rust
let first = save_patient_medical_history_version(
    &conn, patient_id, encounter_id, payload, "DOCTOR_EDIT", None, None
).unwrap();
let second = save_patient_medical_history_version(
    &conn, patient_id, encounter_id, payload_2, "PATIENT_RECONCILIATION",
    Some(appointment_id), Some(source_hash)
).unwrap();
assert_eq!(first.version, 1);
assert_eq!(second.version, 2);
assert_eq!(latest_patient_medical_history(&conn, patient_id).unwrap().unwrap().version, 2);
```

También comprobar paciente inexistente, encuentro firmado, precheckin intacto y
auditoría sin `payload_json`.

- [ ] **Step 2: Ejecutar RED**

Run:

```bash
cargo test patient_medical_history --lib
```

Expected: FAIL porque la tabla y funciones no existen.

- [ ] **Step 3: Añadir migración SQLite**

Agregar al final de `MIGRATIONS`:

```sql
CREATE TABLE patient_medical_history_versions (
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
    ON patient_medical_history_versions(patient_id, version DESC);
```

- [ ] **Step 4: Implementar servicio clínico**

Añadir tipos serializables `PatientMedicalHistoryVersion` y
`SavePatientMedicalHistoryInput`, más:

```rust
pub fn latest_patient_medical_history(
    conn: &Connection,
    patient_id: &str
) -> Result<Option<PatientMedicalHistoryVersion>, ClinicalError>

pub fn save_patient_medical_history_version(
    conn: &mut Connection,
    patient_id: &str,
    input: &SavePatientMedicalHistoryInput
) -> Result<PatientMedicalHistoryVersion, ClinicalError>
```

El guardado validará JSON, paciente, encuentro no firmado y hash del precheckin
actual; calculará la siguiente versión en transacción y auditará solo versión y
fuente.

- [ ] **Step 5: Exponer IPC**

Añadir:

```rust
get_patient_medical_history(patient_id)
save_patient_medical_history(patient_id, input)
```

y registrarlos en `generate_handler!`.

- [ ] **Step 6: Ejecutar GREEN**

Run: `cargo test patient_medical_history --lib`

Expected: todas las pruebas enfocadas pasan.

### Task 2: Contrato editable y conciliación

**Files:**
- Modify: `V2/desktop-app/src/medicalHistoryFormat.ts`
- Create: `V2/desktop-app/src/medicalHistoryReconciliation.ts`
- Create: `V2/desktop-app/src/medicalHistoryReconciliation.test.ts`
- Modify: `V2/desktop-app/package.json`

- [ ] **Step 1: Escribir pruebas TypeScript rojas**

Cubrir:

```ts
const result = reconcileMedicalHistories(
  { allergies: "Penicilina", identification: { estado: "Jalisco" } },
  { allergies: "Sulfas", identification: { municipio: "Guadalajara" } }
);
assert.equal(result.conflicts.length, 1);
assert.equal(result.conflicts[0].path, "allergies");
assert.equal(result.merged.identification.estado, "Jalisco");
assert.equal(result.merged.identification.municipio, "Guadalajara");
```

Añadir igualdad de familiares sin importar orden y aplicación de decisiones.

- [ ] **Step 2: Ejecutar RED**

Run: `npm run test`

Expected: FAIL por módulo ausente.

- [ ] **Step 3: Exponer contrato**

Exportar desde `medicalHistoryFormat.ts`:

```ts
export type FieldKind = ...
export interface FieldDef { showWhen?; min?; max?; suffix?; ... }
export interface BlockDef { title; onlyForSex?; fields }
export interface GroupDef { audience?; onlyForSex?; fields?; blocks? }
export const MEDICAL_HISTORY_GROUPS
export const FAMILY_CONDITIONS
export const FAMILY_RELATIVES
export function patientMedicalHistoryGroups(sex)
```

El espejo deberá coincidir con el contrato público, incluido `systemsReview`
como `audience: "doctor"` para excluirlo del editor.

- [ ] **Step 4: Implementar conciliación pura**

Exportar:

```ts
export type MedicalHistoryPayload = Record<string, unknown>;
export interface MedicalHistoryConflict {
  path: string;
  groupLabel: string;
  fieldLabel: string;
  currentValue: unknown;
  incomingValue: unknown;
}
export function reconcileMedicalHistories(current, incoming): {
  merged: MedicalHistoryPayload;
  conflicts: MedicalHistoryConflict[];
  autoMergedCount: number;
}
export function applyConflictDecisions(merged, conflicts, decisions)
```

- [ ] **Step 5: Ejecutar GREEN**

Run: `npm run test`

Expected: pruebas de presentación y conciliación pasan.

### Task 3: Componentes de conciliación y editor

**Files:**
- Create: `V2/desktop-app/src/MedicalHistoryReconciliation.tsx`
- Create: `V2/desktop-app/src/MedicalHistoryEditor.tsx`
- Modify: `V2/desktop-app/src/App.css`

- [ ] **Step 1: Crear comparación en dos columnas**

El componente recibirá conflictos, decisiones y callbacks. Solo permitirá
`Revisar y editar resultado` cuando cada ruta tenga elección:

```tsx
<button onClick={() => onChoose(conflict.path, "current")}>
  Conservar expediente
</button>
<button onClick={() => onChoose(conflict.path, "incoming")}>
  Usar respuesta nueva
</button>
```

- [ ] **Step 2: Crear editor completo**

El componente recibirá `value`, `onChange`, `onSave`, `onCancel`, `busy`.
Renderizará generales, grupos, bloques, familiares y controles por `kind`.
Aplicará `onlyForSex` y `showWhen` con las mismas reglas del portal.

- [ ] **Step 3: Añadir estilos**

Usar:

- cabecera con acciones;
- conciliación `grid-template-columns: 1fr 1fr`;
- selector visible por conflicto;
- formulario por secciones con divisores;
- colapso a una columna a `760px`;
- tokens `var(--*)` para Cobalto Nocturno.

- [ ] **Step 4: Compilar**

Run: `npm run build`

Expected: TypeScript y Vite pasan.

### Task 4: Integración en Atención

**Files:**
- Modify: `V2/desktop-app/src/Atencion.tsx`
- Modify: `V2/desktop-app/src/ipc.ts`

- [ ] **Step 1: Ampliar detalle y mock IPC**

Añadir `permanent_medical_history` al detalle o cargarlo mediante comando.
Implementar los comandos mock de lectura y guardado versionado.

- [ ] **Step 2: Eliminar formulario resumido**

Eliminar el bloque con alergias, antecedentes personales/familiares, nacimiento
y `Guardar antecedentes`. Conservar los campos legados en estado/backend solo
para compatibilidad de otras pantallas.

- [ ] **Step 3: Añadir flujo**

Estados:

```ts
type MedicalHistoryMode = "read" | "reconcile" | "edit";
const [historyMode, setHistoryMode] = useState<MedicalHistoryMode>("read");
const [historyDraft, setHistoryDraft] = useState<MedicalHistoryPayload>({});
const [conflictDecisions, setConflictDecisions] = useState<Record<string, "current" | "incoming">>({});
```

`Editar antecedentes` cargará versión permanente y precheckin; abrirá
conciliación si hay conflictos, o editor si no los hay.

- [ ] **Step 4: Guardar versión**

Enviar JSON, fuente, encounter/appointment y hash. Tras éxito recargar detalle,
volver a lectura y mostrar `Antecedentes guardados como nueva versión`.

- [ ] **Step 5: Verificar**

Run:

```bash
npm run test
npm run build
cargo test --lib
```

Expected: todo pasa.

### Task 5: Verificación visual

**Files:**
- No production files.

- [ ] **Step 1: Revisar flujo sin versión**

Confirmar editor vacío o prellenado desde paciente.

- [ ] **Step 2: Revisar conciliación**

Confirmar dos columnas, solo conflictos reales, progreso y fusión automática.

- [ ] **Step 3: Revisar editor**

Confirmar campos condicionales, familiares, cancelar y guardar.

- [ ] **Step 4: Revisar temas y ancho**

Confirmar tema claro, Cobalto Nocturno y ancho estrecho sin scroll horizontal.
