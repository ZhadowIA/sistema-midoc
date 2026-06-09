# Plan de implementación para adaptar una historia clínica completa en MiDoc

**Proyecto:** `ZhadowIA/sistema-midoc`  
**Módulo principal:** `consultorio-app`  
**Stack confirmado:** Next.js App Router + TypeScript + Prisma + PostgreSQL  
**Versión del documento:** 1.0  
**Fecha:** 2026-04-17

---

## 1. Resumen ejecutivo

MiDoc ya cuenta con una base funcional adecuada para incorporar una historia clínica completa sin rediseñar el sistema desde cero. Actualmente el sistema ya dispone de:

- directorio de pacientes;
- expediente básico (`MedicalRecord`);
- cuestionario preconsulta (`Questionnaire`);
- nota clínica SOAP por cita (`ClinicalNote`);
- recetas (`Prescription`);
- soporte de IA para transcripción y generación de SOAP.

La estrategia correcta no es crear un módulo clínico aislado, sino **extender y conectar** lo que ya existe.

### Objetivo
Implementar una **historia clínica completa, estructurada y reutilizable**, separando claramente:

1. **Historia clínica base del paciente**: antecedentes longitudinales.
2. **Encuentro clínico por cita**: motivo de consulta, padecimiento actual, exploración, impresión diagnóstica y plan.
3. **Nota clínica final SOAP**: documento final de la consulta, generado manualmente o con apoyo de IA.

---

## 2. Estado actual confirmado de MiDoc

De acuerdo con la documentación y el esquema del proyecto, MiDoc ya tiene:

- `Patient` como entidad de expediente/directorio;
- `Questionnaire` asociado a `Appointment` y almacenado como JSON;
- `MedicalRecord` con campos longitudinales básicos;
- `ClinicalNote` con secciones SOAP y `soapPayload`;
- `Prescription` vinculada a la nota clínica;
- `AIInsight` y `AIProcessingJob` para módulos de IA.

Además:

- el detalle de paciente ya expone `medicalRecord`, citas, cuestionario y nota clínica;
- el `PATCH /api/admin/patients/[id]` actualmente hace `upsert` de `MedicalRecord`;
- el `POST /api/admin/appointments/[id]/note` ya hace `upsert` de SOAP y recetas;
- el cuestionario público ya guarda `primarySymptom` y `responses`;
- la generación de nota con IA ya transcribe audio y genera un `ClinicalNote`.

---

## 3. Principio de diseño clínico oficial

### Regla general

- **Paciente** = datos clínicos persistentes y longitudinales.
- **Cita** = motivo de consulta y evaluación del encuentro actual.
- **SOAP** = salida final resumida del acto clínico.
- **Receta** = asociada a la nota SOAP.
- **Cuestionario preconsulta** = insumo inicial del encuentro clínico.

### Beneficios de este enfoque

- evita duplicidad de antecedentes en cada consulta;
- permite reutilización en citas subsecuentes;
- conserva compatibilidad con la arquitectura actual;
- mejora el contexto para IA clínica;
- facilita trazabilidad médico-legal.

---

# 4. Formato clínico oficial MiDoc v1.0

## 4.1 Estructura oficial del expediente clínico

MiDoc debe manejar **3 capas clínicas oficiales**:

### A. Historia clínica base del paciente
Documento longitudinal.

### B. Encuentro clínico por cita
Documento clínico de cada `Appointment`.

### C. Nota clínica final SOAP
Documento de salida y cierre clínico.

---

## 4.2 Historia clínica base oficial (longitudinal)

### 1) Identificación clínica

- nombre completo
- fecha de nacimiento
- sexo biológico
- género
- estado civil
- ocupación
- domicilio
- teléfono
- correo
- grupo sanguíneo

### 2) Antecedentes heredofamiliares

- diabetes mellitus
- hipertensión arterial
- cardiopatías
- enfermedad renal
- enfermedad tiroidea
- cáncer
- autoinmunes
- psiquiátricos
- trombosis
- dislipidemia
- obesidad
- otros

### 3) Antecedentes personales no patológicos

- tipo de vivienda
- alimentación
- actividad física
- sueño
- higiene
- tabaquismo
- alcohol
- otras sustancias
- inmunizaciones
- exposición ocupacional
- viajes recientes
- contacto con animales
- sexualidad resumida

### 4) Antecedentes personales patológicos

- enfermedades crónicas
- hospitalizaciones
- cirugías
- traumatismos
- transfusiones
- alergias
- infecciones relevantes
- medicamentos crónicos actuales

### 5) Ginecoobstétricos / andrológicos

**AGO:**
- menarca
- FUM
- ritmo menstrual
- IVSA
- gestas
- partos
- cesáreas
- abortos
- anticoncepción
- Papanicolaou
- mastografía

**Andrológicos:**
- IVSA
- ETS previas
- síntomas prostáticos
- disfunción eréctil

### 6) Alertas clínicas

- alergias graves
- uso de anticoagulantes
- embarazo
- antecedente de trombosis
- marcapasos
- riesgo suicida
- riesgo de caídas
- otras banderas rojas

---

## 4.3 Encuentro clínico oficial por cita

### 1) Motivo de consulta
Campo principal corto y obligatorio.

### 2) Padecimiento actual

Debe capturar:

- inicio
- tiempo de evolución
- forma de inicio
- curso
- localización
- irradiación
- características
- intensidad
- factores desencadenantes
- agravantes
- atenuantes
- síntomas acompañantes
- tratamientos previos
- resumen clínico

### 3) Negativos relevantes
Lista breve y dirigida por problema principal.

### 4) Interrogatorio por sistemas

- generales
- piel y anexos
- cabeza
- ojos
- oídos
- nariz / senos paranasales
- boca / faringe
- cuello
- respiratorio
- cardiovascular
- gastrointestinal
- genitourinario
- musculoesquelético
- neurológico
- endocrino
- hematológico / linfático
- psiquiátrico

### 5) Signos vitales y somatometría

- TA
- FC
- FR
- temperatura
- SatO2
- peso
- talla
- IMC
- glucemia capilar
- observaciones

### 6) Exploración física

- estado general
- cabeza
- ojos
- ORL
- cuello
- tórax respiratorio
- cardiovascular
- abdomen
- extremidades
- neurológico
- piel
- ginecológico / urológico / rectal si aplica

### 7) Impresión diagnóstica
Lista ordenada con:

- diagnóstico
- porcentaje de probabilidad
- fundamento clínico
- estudios para confirmar

### 8) Plan

- laboratorios
- gabinete
- tratamiento farmacológico
- tratamiento no farmacológico
- educación al paciente
- datos de alarma
- seguimiento

---

## 4.4 Nota clínica final SOAP oficial

Debe mantenerse como documento final de la consulta.

### Subjetivo
Resumen clínico de síntomas, antecedentes relevantes y contexto del motivo de consulta.

### Objetivo
Signos vitales, exploración física, estudios relevantes y hallazgos.

### Assessment
Diagnósticos probables, diferenciales y juicio clínico.

### Plan
Estudios, tratamiento, educación, seguimiento y receta.

---

## 4.5 Reglas oficiales de completitud

No debe permitirse cerrar clínicamente una consulta sin:

- motivo de consulta;
- resumen de padecimiento actual;
- signos vitales o razón explícita de no toma;
- exploración física resumida;
- al menos un diagnóstico;
- al menos un elemento en plan.

---

## 4.6 Estados oficiales del documento

### Historia clínica base
- `DRAFT`
- `IN_REVIEW`
- `FINAL`

### Encuentro clínico
- `DRAFT`
- `IN_REVIEW`
- `FINAL`

### Nota SOAP
- `DRAFT`
- `SIGNED`

---

# 5. Modelo funcional propuesto

## 5.1 Capa 1: Historia clínica base del paciente

Persistencia por paciente.

**Responsable:** médico / secretaria autorizada / asistente clínico según permisos.

**Uso:**
- consulta inicial;
- actualización longitudinal;
- contexto para IA;
- alertas clínicas visibles.

## 5.2 Capa 2: Encuentro clínico por cita

Persistencia por `Appointment`.

**Responsable:** médico.

**Uso:**
- capturar la consulta actual;
- prellenarse desde cuestionario;
- alimentar SOAP e IA.

## 5.3 Capa 3: Nota SOAP final

Persistencia por `Appointment`.

**Responsable:** médico.

**Uso:**
- documento final de consulta;
- impresión / entrega / trazabilidad clínica.

---

# 6. Contrato lógico oficial

```ts
export type ClinicalHistoryPayload = {
  identification: {
    sex?: string | null
    gender?: string | null
    maritalStatus?: string | null
    occupation?: string | null
    address?: string | null
    bloodType?: string | null
  }
  familyHistory: Record<string, unknown>
  nonPathologicalHistory: Record<string, unknown>
  pathologicalHistory: Record<string, unknown>
  gynecoObstetricHistory?: Record<string, unknown> | null
  andrologicHistory?: Record<string, unknown> | null
  currentMedications: Array<Record<string, unknown>>
  allergies: Array<Record<string, unknown>>
  alerts: Array<Record<string, unknown>>
  completionPct: number
  status: 'DRAFT' | 'IN_REVIEW' | 'FINAL'
}

export type EncounterHistoryPayload = {
  chiefComplaint: string
  presentIllness: {
    onset?: string
    duration?: string
    course?: string
    location?: string
    radiation?: string
    characteristics?: string
    intensity?: string
    aggravatingFactors?: string
    relievingFactors?: string
    associatedSymptoms?: string[]
    previousTreatments?: string[]
    summary?: string
  }
  pertinentNegatives: string[]
  reviewOfSystems: Record<string, unknown>
  vitals: Record<string, unknown>
  physicalExam: Record<string, unknown>
  assessment: Array<{
    diagnosis: string
    probabilityPct?: number
    basis?: string
    studiesToConfirm?: string[]
  }>
  diagnosticPlan: Record<string, unknown>
  treatmentPlan: Record<string, unknown>
  followUp: Record<string, unknown>
  completionPct: number
  status: 'DRAFT' | 'IN_REVIEW' | 'FINAL'
}
```

---

# 7. Backlog técnico ejecutable

## Fase 1 — Base de datos y compatibilidad

### Archivo a modificar

- `consultorio-app/prisma/schema.prisma`

### Objetivo
Agregar nuevos modelos clínicos sin romper compatibilidad con `MedicalRecord`, `Questionnaire` ni `ClinicalNote`.

### Cambios propuestos

#### 1. Crear modelo `ClinicalHistory`

Campos sugeridos:

- `id String @id @default(cuid())`
- `patientId String @unique`
- `doctorId String`
- `payload Json`
- `completionPct Int @default(0)`
- `status ClinicalDocStatus @default(DRAFT)`
- `lastReviewedAt DateTime?`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

#### 2. Crear modelo `EncounterHistory`

Campos sugeridos:

- `id String @id @default(cuid())`
- `appointmentId String @unique`
- `patientId String`
- `doctorId String`
- `payload Json`
- `completionPct Int @default(0)`
- `status ClinicalDocStatus @default(DRAFT)`
- `prefilledFromQuestionnaire Boolean @default(false)`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

#### 3. Agregar enum `ClinicalDocStatus`

- `DRAFT`
- `IN_REVIEW`
- `FINAL`
- `SIGNED`

#### 4. Relaciones nuevas

**En `Patient`:**
- `clinicalHistory ClinicalHistory?`

**En `Appointment`:**
- `encounterHistory EncounterHistory?`

#### 5. Extender auditoría
Agregar acciones recomendadas a `AuditAction`:

- `CLINICAL_HISTORY_UPDATED`
- `ENCOUNTER_HISTORY_UPDATED`
- `CLINICAL_NOTE_SIGNED`

### Compatibilidad temporal
Durante una versión:

- conservar `MedicalRecord`;
- migrar sus datos a `ClinicalHistory.payload`;
- permitir que el PATCH actual de paciente siga funcionando;
- mantener lectura dual en detalle de paciente.

### Entregables

- migración Prisma nueva;
- esquema actualizado;
- relaciones funcionales.

---

## Fase 2 — Validación clínica y contratos Zod

### Archivos nuevos

- `consultorio-app/src/lib/clinicalHistorySchema.ts`
- `consultorio-app/src/lib/encounterHistorySchema.ts`
- `consultorio-app/src/lib/clinicalFormat.ts`

### Objetivo
Centralizar el formato clínico oficial y su validación.

### Tareas

- definir `ClinicalHistoryPayloadSchema`;
- definir `EncounterHistoryPayloadSchema`;
- definir defaults oficiales;
- crear funciones de completitud;
- crear mapeo de prefill desde cuestionario.

### Funciones sugeridas

- `buildEmptyClinicalHistory()`
- `buildEmptyEncounterHistory()`
- `calculateClinicalCompletionPct(payload)`
- `calculateEncounterCompletionPct(payload)`
- `mapQuestionnaireToEncounterPrefill(questionnaire)`

### Regla técnica
Ninguna ruta clínica debe aceptar JSON arbitrario fuera de estos schemas.

---

## Fase 3 — Servicios de dominio clínico

### Archivos nuevos

- `consultorio-app/src/services/ClinicalHistoryService.ts`
- `consultorio-app/src/services/EncounterHistoryService.ts`

### Archivo existente a modificar

- `consultorio-app/src/services/QuestionnaireService.ts`

### Objetivo
Concentrar la lógica clínica reusable y desacoplarla de las rutas.

### ClinicalHistoryService
Métodos sugeridos:

- `getByPatientId(patientId, doctorId)`
- `upsertByPatientId(patientId, doctorId, payload)`
- `migrateFromMedicalRecord(patientId)`
- `summarizeForClinicalUse(patientId)`

### EncounterHistoryService
Métodos sugeridos:

- `getByAppointmentId(appointmentId, doctorId)`
- `upsertByAppointmentId(appointmentId, doctorId, payload)`
- `prefillFromQuestionnaire(appointmentId)`
- `snapshotForSoap(appointmentId)`

### QuestionnaireService
Extensiones recomendadas:

- `buildEncounterPrefill(appointmentId)`
- mapear `primarySymptom` a `chiefComplaint`
- mapear `responses` a `presentIllness`
- mapear `responses` a `reviewOfSystems`

---

## Fase 4 — Endpoints administrativos nuevos

### Archivos nuevos

- `consultorio-app/src/app/api/admin/patients/[id]/clinical-history/route.ts`
- `consultorio-app/src/app/api/admin/appointments/[id]/encounter-history/route.ts`

### Archivos existentes a modificar

- `consultorio-app/src/app/api/admin/patients/[id]/route.ts`
- `consultorio-app/src/app/api/admin/appointments/[id]/note/route.ts`

### Endpoint: historia clínica base del paciente

#### `GET /api/admin/patients/[id]/clinical-history`
Debe:
- validar ownership;
- devolver historia clínica oficial;
- si no existe, devolver payload vacío con intento de migración desde `MedicalRecord`.

#### `PATCH /api/admin/patients/[id]/clinical-history`
Debe:
- validar payload con Zod;
- recalcular `completionPct`;
- hacer `upsert`;
- registrar auditoría.

### Endpoint: encuentro clínico por cita

#### `GET /api/admin/appointments/[id]/encounter-history`
Debe:
- validar ownership de cita;
- devolver el encuentro actual;
- si no existe, permitir prefill desde `Questionnaire`.

#### `PATCH /api/admin/appointments/[id]/encounter-history`
Debe:
- validar payload;
- recalcular `completionPct`;
- guardar cambios;
- auditar.

### Adaptación del endpoint de paciente existente

#### Archivo
`consultorio-app/src/app/api/admin/patients/[id]/route.ts`

#### Cambio recomendado
Mantener compatibilidad, pero:
- añadir lectura de `clinicalHistory`;
- exponer indicador de completitud;
- reducir dependencia futura de `MedicalRecord`.

### Adaptación del endpoint SOAP existente

#### Archivo
`consultorio-app/src/app/api/admin/appointments/[id]/note/route.ts`

#### Cambios recomendados
Aceptar opcionalmente:

- `finalize?: boolean`
- `sign?: boolean`
- `historySnapshot?: boolean`

Comportamiento:
- si `finalize` o `sign` es `true`, validar mínimos clínicos;
- guardar snapshot del contexto usado;
- registrar auditoría de firma/cierre.

---

## Fase 5 — Cuestionario preconsulta v2

### Archivo existente a modificar

- `consultorio-app/src/app/api/public/questionnaire/[token]/route.ts`

### Objetivo
Convertir el cuestionario en insumo estructurado del encuentro clínico.

### Estrategia
Mantener compatibilidad con:
- `primarySymptom`
- `responses`

Pero estandarizar nuevas claves internas dentro de `responses`:

- `chiefComplaint`
- `presentIllness`
- `painMap`
- `pertinentNegatives`
- `currentMeds`
- `allergies`
- `ros`

### Reglas

- no duplicar toda la historia clínica longitudinal en este cuestionario;
- limitarse a datos de preconsulta y motivo actual;
- mantener sanitización y límites de tamaño actuales.

### Resultado esperado
Al abrir la consulta, el encuentro clínico puede prellenarse automáticamente.

---

## Fase 6 — Integración con IA clínica

### Archivo existente a modificar

- `consultorio-app/src/services/AINoteGenerationService.ts`

### Objetivo
Que la IA no dependa sólo del audio, sino también del contexto clínico estructurado.

### Cambios
Antes de generar SOAP:

1. cargar `ClinicalHistory` resumida;
2. cargar `EncounterHistory`;
3. cargar `Questionnaire` si existe;
4. construir contexto unificado para prompt.

### Nueva secuencia ideal

1. paciente responde cuestionario;
2. sistema prellena encuentro clínico;
3. médico revisa y completa;
4. IA transcribe audio y genera SOAP;
5. médico corrige y firma.

### Restricciones

- la IA no debe sobreescribir directamente la historia clínica base;
- la IA sí puede sugerir completar campos faltantes;
- el resultado final debe seguir entrando en `ClinicalNote`.

---

## Fase 7 — UI clínica

### Componentes nuevos sugeridos

- `src/components/clinical/ClinicalHistoryForm.tsx`
- `src/components/clinical/EncounterHistoryForm.tsx`
- `src/components/clinical/ClinicalAlertsBar.tsx`
- `src/components/clinical/CompletionMeter.tsx`
- `src/components/clinical/AssessmentList.tsx`

### Pantalla de paciente

Agregar pestaña nueva:
- `Historia clínica`

Secciones recomendadas:
- identificación
- AHF
- APNP
- APP
- AGO / andrológicos
- alergias y medicamentos
- alertas clínicas

### Pantalla de cita

Agregar pestaña nueva:
- `Encuentro clínico`

Elementos recomendados:
- botón `Prefill desde cuestionario`
- botón `Cargar antecedentes del paciente`
- botón `Generar SOAP`
- botón `Finalizar consulta`

### UX recomendada

- formularios por secciones;
- guardado parcial;
- indicadores de completitud;
- alertas clínicas visibles siempre.

---

## Fase 8 — Auditoría y trazabilidad

### Servicios / áreas a modificar

- `AppointmentAuditService`
- cualquier helper que escriba en `AppointmentAuditLog` o `AuditLog`

### Eventos a registrar

- creación o actualización de historia clínica base;
- creación o actualización de encuentro clínico;
- prefill desde cuestionario;
- generación de SOAP con IA;
- firma o cierre clínico;
- usuario actor;
- snapshot clínico usado en cierre.

### Recomendación adicional

Agregar versionado posterior:
- `ClinicalHistoryVersion`
- `EncounterHistoryVersion`

Esto puede dejarse para release 2.

---

## Fase 9 — Pruebas

### Archivos nuevos sugeridos

- `src/tests/integration/clinical-history.api.test.ts`
- `src/tests/integration/encounter-history.api.test.ts`
- `src/tests/unit/clinical-format.test.ts`
- `src/tests/unit/questionnaire-prefill.test.ts`

### Casos mínimos

#### Historia clínica base
- GET sin historia previa
- migración desde `MedicalRecord`
- PATCH válido
- PATCH inválido por schema
- cálculo correcto de completitud

#### Encuentro clínico
- GET sin encuentro previo
- prefill desde cuestionario
- PATCH válido
- PATCH inválido
- actualización de completitud

#### SOAP y cierre
- no permitir firma sin mínimos clínicos
- permitir firma cuando requisitos estén completos
- persistir snapshot clínico

---

# 8. Orden exacto de desarrollo

1. actualizar `schema.prisma`
2. crear migración Prisma
3. crear schemas Zod clínicos
4. crear `ClinicalHistoryService`
5. crear `EncounterHistoryService`
6. crear endpoint `patients/[id]/clinical-history`
7. crear endpoint `appointments/[id]/encounter-history`
8. adaptar `patients/[id]/route.ts`
9. adaptar `QuestionnaireService`
10. adaptar `public/questionnaire/[token]/route.ts`
11. adaptar `appointments/[id]/note/route.ts`
12. adaptar `AINoteGenerationService`
13. crear UI de historia clínica base
14. crear UI de encuentro clínico
15. ampliar auditoría
16. crear pruebas
17. habilitar rollout por feature flag

---

# 9. Criterio de terminado

Se considera terminado cuando:

- un paciente puede tener historia clínica base persistente;
- una cita puede tener encuentro clínico editable;
- el cuestionario puede prellenar el encuentro;
- la IA usa contexto clínico estructurado;
- el SOAP final puede generarse y firmarse;
- existe trazabilidad y snapshot del contexto clínico.

---

# 10. Estrategia de release recomendada

## Release 1

- modelos nuevos
- APIs nuevas
- compatibilidad con legacy
- UI básica
- prefill desde cuestionario
- integración inicial con IA

## Release 2

- versionado formal de documentos clínicos
- firma clínica avanzada
- mejoras de UX
- alertas clínicas más visibles
- retiro gradual de escritura directa a `MedicalRecord`

---

# 11. Archivos involucrados (resumen rápido)

## Modificar

- `consultorio-app/prisma/schema.prisma`
- `consultorio-app/src/app/api/admin/patients/[id]/route.ts`
- `consultorio-app/src/app/api/admin/appointments/[id]/note/route.ts`
- `consultorio-app/src/app/api/public/questionnaire/[token]/route.ts`
- `consultorio-app/src/services/QuestionnaireService.ts`
- `consultorio-app/src/services/AINoteGenerationService.ts`

## Crear

- `consultorio-app/src/lib/clinicalHistorySchema.ts`
- `consultorio-app/src/lib/encounterHistorySchema.ts`
- `consultorio-app/src/lib/clinicalFormat.ts`
- `consultorio-app/src/services/ClinicalHistoryService.ts`
- `consultorio-app/src/services/EncounterHistoryService.ts`
- `consultorio-app/src/app/api/admin/patients/[id]/clinical-history/route.ts`
- `consultorio-app/src/app/api/admin/appointments/[id]/encounter-history/route.ts`
- `src/components/clinical/*`
- `src/tests/unit/*`
- `src/tests/integration/*`

---

# 12. Recomendación final

La implementación debe orientarse a que MiDoc maneje una clínica digital consistente:

- **antecedentes longitudinales** en el expediente;
- **consulta actual** en la cita;
- **nota final SOAP** como documento clínico de cierre.

Ese diseño es el más sólido para crecer hacia:

- expedientes más completos;
- automatización clínica;
- IA con mejor contexto;
- mayor trazabilidad médico-legal;
- mejor velocidad de consulta.

---

# 13. Referencias internas utilizadas para este plan

1. README del monorepo.
2. Documento `SISTEMA_ACTUAL.md`.
3. Esquema Prisma actual.
4. Endpoints actuales de pacientes, nota clínica, cuestionario e IA.

