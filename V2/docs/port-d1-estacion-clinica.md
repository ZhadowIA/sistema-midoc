# Plan de implementación — Port de D1 «Estación Clínica» a producción

Fecha: 2026-06-17 · Estado: propuesto · Paso de la línea: **Paso 4 — Atención clínica integrada** (refactor de UX, no nuevo comportamiento).

Prototipos de referencia (no productivos): `V2/design-propuesta/D1 Estacion Clinica - Atencion v2.html`, `D1 v3 - Plantillas personalizadas.html`.

## 1. Ubicación y naturaleza del cambio (regla 1)

Es un **refactor de presentación** de una capacidad ya terminada (Paso 4). No introduce:

- comportamiento clínico nuevo (la nota, el scribe, la receta y el firmado ya existen),
- tablas, campos ni comandos IPC nuevos,
- ningún dato en la nube, logs ni telemetría (reglas 2 y 4 no se tocan: todo sigue local).

Por eso no abre un paso nuevo: se integra al Paso 4 como mejora de UX. Commits con prefijo `refactor:` / `feat:` (UI) / `test:` / `docs:`.

## 2. Qué entra y qué NO entra en este port

**Entra (rediseño de la pantalla de Atención):**

- Disposición en 3 paneles: nav/agenda · nota activa · contexto permanente.
- Panel de **contexto permanente** a la derecha (alergias, precheck-in, medicación, últimas consultas) siempre visible mientras se edita la nota.
- **Conmutador de modo** en el centro (Nota · Dictado · Receta · Odontograma) re-presentando la navegación de secciones actual.
- **Riel de agenda** a la izquierda con cambio de paciente sin volver atrás.

**No entra (se trata aparte, cada uno su plan):**

- D2 «Cobalto Nocturno» y «Modo Foco» (tema + foco; rebanada futura, encima de esto).
- Editor de nota dirigido por plantilla + constructor (prototipo `v3`): depende de `consultation_templates`; rebanada posterior, ver §6.
- Cualquier cambio de la regla «requerido lo marca la plantilla, no el perfil»: decisión de producto registrada, se implementa con el editor de plantillas, no aquí.

## 3. Estrategia: rebanadas verticales

De menor a mayor riesgo. Cada rebanada es una rama corta, un PR a `dev`, con su Definition of Done. **El primer port es la Rebanada A.**

| Rebanada | Alcance | Riesgo | Plomería nueva |
|---|---|---|---|
| **A — Contexto permanente + shell 3 columnas** | Mueve alergias/precheck-in/medicación/historia a un `<aside>` derecho fijo; `encounter-layout` pasa a 3 columnas (nav · main · contexto) | Bajo | Ninguna (solo reorg de datos que `EncounterDetail` ya trae) |
| **B — Conmutador de modo** | Re-presenta `encounter-nav` como control segmentado Nota/Dictado/Receta/(Odontograma) | Medio | Ninguna |
| **C — Riel de agenda** | Riel izquierdo con citas del día; cambiar de encuentro sin `onBack` | Alto | Sí: `App.tsx` pasa `appointments` + `onSelectAppointment` a `Atencion`; elevar estado de navegación |
| **D — (futura) Foco + Nocturno** | Tema oscuro recalibrado + modo foco de dictado | Bajo | Variable raíz de tema |

## 4. Rebanada A — el primer port (detalle)

**Rama:** `v2/paso4-estacion-contexto`

**Objetivo de validación:** durante una consulta abierta, alergias, precheck-in, medicación e historia son visibles sin hacer scroll vertical en la columna de la nota; el comportamiento de guardar/firmar no cambia.

### Archivos que se tocan

- `src/Atencion.tsx` — reorganizar JSX: extraer el panel de contexto desde donde hoy viven esas secciones (la alerta de alergias está en `.patient-banner .alert-allergies`; precheck-in/historia están como `<section className="panel">` dentro de `encounter-main`).
- `src/App.css` — `.encounter-layout` de su grid actual a 3 columnas; nuevas clases `.encounter-context`, ajustes responsivos.
- `src/encounterContext.ts` *(nuevo)* — función pura que, dado `EncounterDetail`, arma las secciones del panel de contexto (¿hay alergias?, filas de precheck-in, filas de historia, medicación). Sin JSX.
- `scripts/encounter-context.test.mjs` *(nuevo)* — pruebas de la función pura, patrón `node:assert` como el resto de `scripts/*.test.mjs`.

### Pasos

1. **Extraer lógica pura primero** (`encounterContext.ts`): recibe `EncounterDetail`, devuelve `{ allergies: string[] | null, precheckinRows, historyRows, meds }`. Reutiliza los helpers existentes (`flattenMedicalHistoryDisplayRows`, `formatMedicalHistoryForDisplay`). Esto deja la UI tonta y testeable.
2. **Test del módulo** (`encounter-context.test.mjs`): con alergias / sin alergias, precheck-in vacío vs con datos, historia vacía (primera vez). Correr con `node scripts/encounter-context.test.mjs`.
3. **CSS**: convertir `.encounter-layout` a `grid-template-columns: <nav> 1fr 288px`. Añadir `.encounter-context` (fondo `--surface`, borde-izq `--line`, scroll propio, padding 16px). Bajo 860px (regla de DESIGN.md): el contexto se apila al final o se vuelve un panel colapsable. Sin nuevas sombras (regla de DESIGN.md: borde 1px, no borde+sombra).
4. **JSX**: renderizar `<aside className="encounter-context">` consumiendo `encounterContext.ts`. Quitar la duplicación: la alerta de alergias deja de vivir en el banner (o se mantiene solo como resumen y el detalle va al panel — decidir una, no ambas).
5. **Accesibilidad/motion**: el panel respeta `prefers-reduced-motion`; orden de tabulación lógico (nota antes que contexto).
6. **Verificación manual**: captura antes/después con la app corriendo (`npm run dev` o `desktop-app.exe` según entorno QA), comprobar que guardar nota y firmar siguen funcionando.

### Definition of Done (regla 8)

- [ ] Cumple el objetivo de validación de arriba.
- [ ] `encounterContext.ts` tiene pruebas y pasan (`node scripts/encounter-context.test.mjs`).
- [ ] `npm run build` (`tsc && vite build`) pasa sin warnings nuevos de tipos.
- [ ] No se agregó ningún dato clínico a logs/nube/telemetría (no aplica: cambio solo de presentación).
- [ ] Doc del Paso 4 (o este plan) actualizado con el nuevo layout.
- [ ] PR a `dev` con captura antes/después y checklist.

### Riesgos y mitigación

- **Duplicación de datos** (banner vs panel): decidir una única fuente visible; el panel derecho es la canónica.
- **Scroll**: nota y contexto con scroll independiente; el contexto no debe empujar la nota.
- **Pantallas estrechas**: validar el apilado <860px antes del PR.

## 5. Rebanadas B y C (resumen para planear después)

- **B · Conmutador de modo** (`v2/paso4-estacion-modos`): el control segmentado consume la misma lista de secciones que hoy alimenta `encounter-nav`. Odontograma solo aparece si `resolvedProfile === "ODONTOLOGY"`. Extraer `encounterModes.ts` (qué modos están disponibles) + test. Sin IPC nuevo.
- **C · Riel de agenda** (`v2/paso4-estacion-agenda`): la pieza con plomería real. `Atencion` recibe `appointments` y `onSelectAppointment` desde `App.tsx`; al elegir otra cita se resuelve/abre su encuentro reutilizando el flujo `attend`/`resolve` existente (no duplicar `PatientResolution`). Cuidar el caso «consulta abierta sin firmar» al cambiar de paciente (confirmar antes de salir). Pruebas de selección sobre módulo puro reutilizando `weekAgendaFilters.ts`.

## 6. Plantillas personalizadas (v3) — nota de dependencia

El editor dirigido por plantilla se apoya en `consultation_templates` (`list_consultation_templates`, `normalizeTemplateDefinition`, `buildTemplateSegments`) que **ya existen**. Su port es independiente de A–C y puede ir después de B. La regla «manda la plantilla, no el perfil» cambia el comportamiento actual (hoy se marcan pendientes los requeridos del perfil): ese cambio se hace junto con el editor, con su propia prueba.

## 7. Orden recomendado

A → B → C, cada una mergeada a `dev` antes de empezar la siguiente. D (nocturno/foco) y el editor de plantillas, después, sin bloquear A–C.
