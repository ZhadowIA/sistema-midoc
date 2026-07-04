# Whisper Local Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que los comandos habituales de desarrollo y distribución de MiDoc compilen la app de escritorio con `whisper-local`.

**Architecture:** Mantener `whisper-rs` como dependencia opcional para no cargar la suite Rust ordinaria. Encapsular la activación del feature en scripts npm de producto y proteger esa configuración con una prueba Node que inspecciona `package.json`.

**Tech Stack:** npm scripts, Node test runner, Tauri 2, Cargo features, Rust.

---

### Task 1: Proteger los scripts de producto

**Files:**
- Create: `V2/desktop-app/src/buildScripts.test.ts`
- Modify: `V2/desktop-app/package.json`

- [x] **Step 1: Write the failing test**

Crear una prueba que lea `package.json` y compruebe:

```ts
assert.equal(scripts["tauri:dev"], "tauri dev --features whisper-local");
assert.equal(scripts["tauri:build"], "tauri build --features whisper-local");
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL porque `tauri:dev` y `tauri:build` todavía no existen.

- [x] **Step 3: Write minimal implementation**

Agregar a `scripts`:

```json
"tauri:dev": "tauri dev --features whisper-local",
"tauri:build": "tauri build --features whisper-local"
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: 12 pruebas pasan, 0 fallan.

### Task 2: Documentar el comando correcto

**Files:**
- Modify: `V2/desktop-app/README.md`

- [x] **Step 1: Replace product commands**

Cambiar la guía para usar:

```bash
npm run tauri:dev
npm run tauri:build
```

y aclarar que requieren CMake y LLVM/libclang porque incluyen
`whisper-local`.

### Task 3: Verificar la cadena completa

**Files:**
- Verify: `V2/desktop-app`
- Verify: `V2/desktop-app/src-tauri`

- [x] **Step 1: Verify frontend**

Run: `npm test`

Expected: 12 pruebas pasan.

Run: `npm run build`

Expected: TypeScript y Vite terminan con código 0.

- [x] **Step 2: Verify default Rust path**

Run: `cargo test`

Expected: 0 fallos.

Run: `cargo clippy --lib`

Expected: código 0, sin advertencias nuevas.

- [x] **Step 3: Verify Whisper feature**

Run: `cargo build --features whisper-local`

Expected: código 0 y enlace exitoso de `whisper-rs`.

- [x] **Step 4: Verify distribution command**

Run: `npm run tauri:build -- --no-bundle`

Expected: código 0 y ejecutable release compilado con `whisper-local`.

- [x] **Step 5: Inspect changes**

Run: `git diff --check`

Expected: código 0.
