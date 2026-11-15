# Catalogo CNIS (claves de medicamentos para la receta y el FHIR)

Genera el catalogo con el que la app pone la clave del Compendio Nacional de
Insumos para la Salud a los medicamentos de la receta cuando exporta el
expediente en FHIR (decision del 2026-10-19). Corre **fuera de la app** y no ve
datos de pacientes.

## Fuente

El Compendio Nacional de Insumos para la Salud del Consejo de Salubridad
General, edicion publicada en el DOF el 26 de abril de 2025
(<https://www.csg.gob.mx/Comp26042025.pdf>). Es un documento oficial publicado
en el Diario Oficial de la Federacion, sin derechos de autor (Ley Federal del
Derecho de Autor, art. 14, fr. VIII).

No hay archivo de datos oficial: solo el PDF. Las actualizaciones que el DOF
publique despues de esa edicion **no estan incluidas**; para sumarlas hay que
cambiar `PDF_URL`/`EDITION` en `build.ts` por la edicion nueva (o leer las
actualizaciones) y volver a generar.

## Uso

```bash
npm run test:cnis   # pruebas de la lectura
npm run cnis:build  # descarga, aplica correcciones, compara con la tabla anterior y regenera cnis.csv y cnis.manifest.json
```

Necesita `pdftotext` (poppler) en el PATH; viene con Git para Windows.

## La tabla es la fuente de verdad

La app nunca lee el PDF: lee `src-tauri/src/reference_data/cnis.csv`, que vive
en el repositorio. El script solo ayuda a generarla:

- Al regenerar, imprime que filas son nuevas, cuales se retiraron y cuales
  cambiaron contra la tabla anterior. Eso se revisa en el PR antes de aceptar
  una edicion nueva.
- Lo que el lector no alcanza se completa en `correcciones.csv` (clave,
  generico, forma, concentracion, unidades del envase, **motivo y quien lo
  reviso**). Sin revisor la correccion no entra. Una correccion reemplaza la
  lectura del PDF de esa clave y generico, y sobrevive a cada regeneracion.

## Actualizaciones publicadas en el DOF

`npm run cnis:check` registra en `actualizaciones.json` los acuerdos que actualizan el
compendio despues de la edicion; se aplican con `correcciones.csv` (altas y modificaciones)
y `bajas.csv` (bajas), siempre con revisor. Guia: `V2/docs/MANTENIMIENTO_MEDICAMENTOS.md`.

## Que se conserva

Medicamentos de los grupos `010` (medicamentos), `020` (vacunas y biologicos),
`030` (nutricion) y `040` (psicotropicos y estupefacientes). Una fila por clave
y generico: los productos con alternativas ("PANTOPRAZOL O RABEPRAZOL U
OMEPRAZOL") dan una fila por alternativa, cada una con su concentracion. Por
fila: producto (`010.000.XXXX`), generico, forma farmaceutica, concentracion en
unidad canonica (mg, mcg, UI, mL, %), unidades del envase ("Envase con 20
tabletas" -> 20) y cuantos envases tiene el producto. Las columnas del PDF se
enciman de forma irregular, asi que la lectura es conservadora y marca como
**incompleta** cualquier clave que no pueda atribuir sin ambiguedad:

- un bloque de descripcion con claves de productos distintos;
- un generico que no aparece en la linea "Cada ... contiene";
- una clave repetida en el documento con lecturas que no coinciden;
- combinaciones (`/`, `,`, "compuesta").

Los envases de un mismo producto son la misma presentacion: un envase ilegible
toma la lectura de sus hermanos cuando todos coinciden.

## Como lo usa la app

`src-tauri/src/cnis.rs` (opcion 3, decidida el 2026-10-20):

- **Clave de producto** (`010.000.XXXX`, sistema propio `cnis-producto`) si la
  coincidencia es exacta y unica: un solo generico en la linea y sin
  combinaciones, la concentracion escrita igual a la del compendio (sin
  "mg/5 mL"), un solo producto con ese generico, forma y concentracion, ninguna
  entrada ilegible que pudiera ser la misma y ninguna contradiccion con la forma
  escrita ("liberacion prolongada" debe estar escrito si el compendio lo dice).
- **Clave completa** (`010.000.XXXX.YY`) ademas, si el producto tiene un solo
  envase, o si la receta dice la cantidad ("caja con 20") y justo un envase del
  producto la trae (y se leyeron todos sus envases).

Ante la duda no hay clave; el texto de la receta siempre va.
