# Desktop Clinical Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presentar la preconsulta IA y los antecedentes del paciente con la jerarquía clínica híbrida aprobada, separando secciones, preguntas y respuestas sin sobrecargar la Estación Clínica.

**Architecture:** Extraer el formateo de la preconsulta a un módulo puro y comprobable que produzca motivo, conversación y filas legadas. `Atencion.tsx` consumirá ese modelo para renderizar secciones semánticas, mientras `App.css` aportará líneas, numeración, conteos y adaptación responsive usando los tokens existentes.

**Tech Stack:** React 19, TypeScript 5.8, CSS, Vite 7, Node.js test runner.

---

## Estructura de archivos

- Crear `V2/desktop-app/src/clinicalQuestionnairePresentation.ts`: modelo puro de presentación para la preconsulta.
- Crear `V2/desktop-app/src/clinicalQuestionnairePresentation.test.ts`: pruebas del motivo, conversación y formato legado.
- Modificar `V2/desktop-app/src/Atencion.tsx`: render principal de preconsulta y antecedentes.
- Modificar `V2/desktop-app/src/App.css`: jerarquía visual híbrida y comportamiento responsive.
- Modificar `V2/desktop-app/package.json`: comando de prueba enfocado sin dependencias nuevas.

### Task 1: Modelo comprobable de preconsulta

**Files:**
- Create: `V2/desktop-app/src/clinicalQuestionnairePresentation.test.ts`
- Create: `V2/desktop-app/src/clinicalQuestionnairePresentation.ts`
- Modify: `V2/desktop-app/package.json`

- [ ] **Step 1: Agregar el comando y la prueba fallida**

Añadir a `package.json`:

```json
"test": "node --test src/clinicalQuestionnairePresentation.test.ts"
```

Crear una prueba que espere este contrato:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPreconsultaPresentation } from "./clinicalQuestionnairePresentation.ts";

test("separa motivo y entrevista guiada", () => {
  const result = buildPreconsultaPresentation(JSON.stringify({
    motivo: "Revisión",
    conversation: [
      { question: "¿Desde cuándo?", answer: "Cinco días" },
      { question: "", answer: "Sin fiebre" }
    ]
  }));

  assert.deepEqual(result, {
    motivo: "Revisión",
    questions: [
      { question: "¿Desde cuándo?", answer: "Cinco días" },
      { question: "Pregunta 2", answer: "Sin fiebre" }
    ],
    legacyRows: []
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y comprobar RED**

Run: `npm run test`

Expected: FAIL porque `clinicalQuestionnairePresentation.ts` todavía no existe.

- [ ] **Step 3: Implementar el modelo mínimo**

El módulo exportará:

```ts
export interface PreconsultaQuestion {
  question: string;
  answer: string;
}

export interface PreconsultaPresentation {
  motivo: string;
  questions: PreconsultaQuestion[];
  legacyRows: Array<[string, string]>;
}

export function buildPreconsultaPresentation(raw: string): PreconsultaPresentation
```

Para cargas con `conversation`, separará `motivo` y preguntas. Para JSON legado
usará `flattenMedicalHistoryDisplayRows(raw)`; para texto inválido devolverá una
fila `["Respuestas", raw]`.

- [ ] **Step 4: Ejecutar la prueba y comprobar GREEN**

Run: `npm run test`

Expected: PASS, 1 archivo y todas las pruebas exitosas.

### Task 2: Renderizar la jerarquía clínica híbrida

**Files:**
- Modify: `V2/desktop-app/src/Atencion.tsx`

- [ ] **Step 1: Sustituir el formateador local**

Importar `buildPreconsultaPresentation`, eliminar `AiConversationTurn` y
`formatPrecheckin`, y calcular:

```ts
const preconsultaPresentation = detail.preconsulta
  ? buildPreconsultaPresentation(detail.preconsulta)
  : null;
```

- [ ] **Step 2: Renderizar motivo y entrevista como secciones**

El contenido principal de Preconsulta usará:

```tsx
<div className="clinical-response-groups">
  {preconsultaPresentation.motivo ? (
    <section className="clinical-response-group">
      <div className="clinical-response-heading">
        <h4>Motivo de consulta</h4>
        <span>1 respuesta</span>
      </div>
      <dl className="clinical-field-list">
        <div className="clinical-field-row">
          <dt>Motivo</dt>
          <dd>{preconsultaPresentation.motivo}</dd>
        </div>
      </dl>
    </section>
  ) : null}
</div>
```

La entrevista usará `clinical-question-row`, un número visual y el par
`dt`/`dd`. Las filas legadas usarán `clinical-field-list`.

- [ ] **Step 3: Añadir encabezados y conteos a antecedentes**

Cada `MedicalHistoryGroup` tendrá:

```tsx
<div className="clinical-response-heading">
  <h4>{group.title}</h4>
  <span>{group.rows.length} {group.rows.length === 1 ? "respuesta" : "respuestas"}</span>
</div>
```

Sus filas usarán `clinical-field-list` y `clinical-field-row`. El panel lateral
seguirá usando `precheckin-list` sin cambios.

- [ ] **Step 4: Compilar TypeScript**

Run: `npm run build`

Expected: compilación TypeScript y Vite exitosa.

### Task 3: Aplicar estilos y verificar

**Files:**
- Modify: `V2/desktop-app/src/App.css`

- [ ] **Step 1: Añadir estilos de sección y fila**

Implementar:

```css
.clinical-response-groups {
  display: grid;
  gap: 22px;
}

.clinical-response-group {
  border-top: 2px solid var(--primary);
}

.clinical-response-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0 8px;
}

.clinical-field-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1.4fr);
  gap: 18px;
  padding: 11px 0;
  border-top: 1px solid var(--line);
}
```

Las preguntas llevarán numeración cobalto suave y conservarán `dt`/`dd`.

- [ ] **Step 2: Añadir adaptación estrecha**

A menos de `760px`, `clinical-field-row` cambiará a una columna y los
encabezados podrán envolver sin desbordamiento.

- [ ] **Step 3: Ejecutar verificación completa**

Run:

```bash
npm run test
npm run build
```

Expected: pruebas y build exitosos.

- [ ] **Step 4: Revisar visualmente**

Abrir la desktop app y confirmar:

- Preconsulta: motivo separado y entrevista numerada.
- Antecedentes: secciones con conteo y filas legibles.
- Cobalto Nocturno: contraste correcto mediante tokens.
- Ventana estrecha: una sola columna sin scroll horizontal.
- Panel lateral: conserva la lista compacta anterior.
