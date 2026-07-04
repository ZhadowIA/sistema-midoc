# Layout de transcripción en dos filas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizar Captura y Configuración en la fila superior y colocar Transcripción a ancho completo en la fila inferior.

**Architecture:** Mantener intacto el DOM de `TranscriptionWorkspace` y expresar la composición únicamente con CSS Grid. Añadir una prueba estructural que lea `App.css` y proteja tanto la proporción de escritorio como el cruce de columnas de la transcripción.

**Tech Stack:** React 19, TypeScript 5.8, CSS Grid, Node.js test runner, Vite 7.

---

### Task 1: Proteger el contrato del layout

**Files:**
- Create: `V2/desktop-app/src/transcriptionLayout.test.ts`
- Test: `V2/desktop-app/src/transcriptionLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appCss = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("organiza captura y configuración arriba y la transcripción a ancho completo", () => {
  assert.match(
    appCss,
    /\.transcription-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.1fr\)\s+minmax\(0,\s*0\.9fr\);/s
  );
  assert.match(
    appCss,
    /\.transcription-review\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/transcriptionLayout.test.ts`

Expected: FAIL porque `App.css` todavía define tres columnas y
`.transcription-review` no cruza el grid.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add V2/desktop-app/src/transcriptionLayout.test.ts
git commit -m "test: proteger layout de transcripcion"
```

### Task 2: Implementar el layout aprobado

**Files:**
- Modify: `V2/desktop-app/src/App.css:1826-1855`
- Test: `V2/desktop-app/src/transcriptionLayout.test.ts`

- [ ] **Step 1: Write the minimal CSS implementation**

Reemplazar la definición de columnas del workspace:

```css
.transcription-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 12px;
}
```

Hacer que la transcripción ocupe las dos columnas:

```css
.transcription-review {
  grid-column: 1 / -1;
}
```

Conservar sin cambios el breakpoint existente:

```css
@media (max-width: 1180px) {
  .transcription-workspace {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `node --test src/transcriptionLayout.test.ts`

Expected: PASS, 1 test aprobado.

- [ ] **Step 3: Run the complete desktop verification**

Run: `npm run test`

Expected: PASS, ninguna prueba fallida.

Run: `npm run build`

Expected: exit code 0; TypeScript y Vite compilan.

El proyecto de escritorio no define un script `lint`; comprobarlo en
`package.json` y reportarlo explícitamente.

- [ ] **Step 4: Inspect the resulting diff**

Run:

```bash
git diff --check
git diff -- V2/desktop-app/src/App.css V2/desktop-app/src/transcriptionLayout.test.ts
```

Expected: solo aparecen el contrato de prueba y las reglas del grid; no se
alteran los estilos existentes de textarea, carga o spinner.

- [ ] **Step 5: Commit the implementation**

```bash
git add V2/desktop-app/src/App.css
git commit -m "fix: reorganizar panel de transcripcion"
```

### Task 3: Validar visualmente el comportamiento

**Files:**
- No source changes expected.

- [ ] **Step 1: Open the desktop UI in development mode**

Run: `npm run dev -- --host 127.0.0.1`

Expected: Vite expone una URL local sin errores de compilación.

- [ ] **Step 2: Verify desktop composition**

Abrir `Transcripción consulta` con ancho mayor a `1180px`.

Expected:

- Captura y Configuración comparten la fila superior.
- Captura es ligeramente más ancha.
- Transcripción aparece debajo y ocupa el ancho total.
- Los turnos largos aumentan únicamente la altura de la fila inferior.

- [ ] **Step 3: Verify responsive composition**

Reducir el viewport a `1180px` o menos.

Expected: Captura, Configuración y Transcripción se apilan en ese orden sin
desbordamiento horizontal.
