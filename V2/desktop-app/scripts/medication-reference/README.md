# Pipeline de base de medicamentos (paso 25)

Genera la base de referencia de interacciones farmaco-farmaco a partir de
fuentes de **dominio publico**, expandiendo reglas por clase a pares canonicos
de ingredientes en el formato que empareja el motor determinista de Rust
(`src-tauri/src/medication.rs`). Corre **fuera de la app** y nunca ve datos de
pacientes.

## Por que ONChigh y no DDInter

DDInter se publica bajo **CC BY-NC** (no comercial). MiDoc es un SaaS de pago,
asi que usar DDInter requiere permiso escrito. La fuente por defecto es
**ONChigh** (lista de interacciones de alta prioridad del panel ONC/Phansalkar),
de **dominio publico** (RAND cedio al gobierno de EE. UU. licencia mundial
irrevocable) y usada por la propia NLM hasta 2024. Es una lista *por clase* de
alta prioridad: cubre lo que debe interrumpir al medico, no cada par documentado.
Trade-off deliberado: menor volumen bruto, menos fatiga de alertas.

Ref.: Phansalkar S. et al., JAMIA 2012 — https://pmc.ncbi.nlm.nih.gov/articles/PMC3422823/

## Uso

```bash
npm run test:medication          # pruebas del pipeline (TDD)
npm run medication:build         # genera artefactos en ./build/ (version por fecha)
npm run medication:build 2026-07 # con version explicita
```

Salida en `./build/` (ignorada por git; se regenera de forma reproducible):

- `interactions.csv` — `ingredient_a,ingredient_b,severity,source,source_version,description`
- `medications.csv` — `name,ingredient,display_name,drug_class`
- `manifest.json` — version, licencia por fuente, conteos y checksums SHA-256

## Diseno

- `reference.ts` — funciones PURAS y deterministas: `normalizeName` y
  `canonicalPair` espejan `medication.rs`; `expandClassRule` / `expandRuleset`
  convierten reglas por clase en pares canonicos (deduplicados, con la severidad
  mas alta en conflicto, ordenados). El motor **no cambia** su emparejamiento.
- `sources.ts` — datos curados con procedencia: reglas ONChigh, miembros por
  clase e ingredientes base (vocabulario ingles de RxNorm, como
  `medications.csv`).
- `build.ts` — emite los artefactos.

## Pendiente (rebanadas siguientes)

- **Rebanada 2 — capa mexicana:** alias marca comercial -> ingrediente desde
  COFEPRIS / Compendio Nacional de Insumos. Marcado `TODO(cofepris)` en
  `sources.ts`. Hoy solo hay unos alias de ejemplo (Advil, Tempra…).
- **Rebanada 2 — lista ONChigh completa y RxClass real:** hoy el subconjunto de
  reglas y los miembros de clase estan curados a mano (`TODO(onchigh-full)`);
  falta transcribir el apendice completo y derivar los miembros de clase desde
  RxClass de forma reproducible.
- **Ingest consciente de la fuente en Rust — HECHO (rebanada 2).**
  `parse_interactions_csv` lee el formato del paso 25 conservando la fuente real
  y la descripcion (con soporte de campos entrecomillados), y `parse_interactions`
  enruta por encabezado entre el formato nuevo y el DDInter heredado.
  `update_reference` ya usa el dispatcher.
- **Triple whammy (reglas n-arias) — HECHO.** El motor evalua interacciones de
  tres clases por las clases presentes en la prescripcion (tabla
  `class_triple_interactions`, `parse_triples_csv`, `import_triples`). El
  pipeline emite `triples.csv`; `sources.ts` define la clase Diuretico y las
  reglas IECA/ARA2 + diuretico + AINE.
- **Data swap — HECHO (rebanada 3).** `reference_data/` ya contiene la base
  ONChigh generada (`medications.csv`, `interactions.csv`, `triples.csv`,
  `manifest.json`); `ddinter.csv` (CC BY-NC) fue **eliminado**. La semilla
  empaquetada (`BUNDLED_*`, version `onchigh-2026-07-07`) instala esta base.
  Para regenerarla: `npm run medication:build <version>` y copiar los tres CSV
  + manifest a `src-tauri/src/reference_data/`.
- **Pendiente (ops, no codigo):** publicar los artefactos en los endpoints
  `MIDOC_*_URL` (incluido `MIDOC_TRIPLES_URL`) para actualizacion
  post-instalacion sin reinstalar la app. `openfda.json` es un artefacto
  legado de dominio publico aun no regenerado por el pipeline (`labels: 0` en
  el manifest; los 64 textos siguen sirviendo de respaldo).
