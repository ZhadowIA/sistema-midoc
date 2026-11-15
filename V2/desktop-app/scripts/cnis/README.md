# Catalogo CNIS (claves de medicamentos para el FHIR)

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
npm run cnis:build  # descarga y regenera src-tauri/src/reference_data/cnis.csv y cnis.manifest.json
```

Necesita `pdftotext` (poppler) en el PATH; viene con Git para Windows.

## Que se conserva

Solo medicamentos (grupo `010.000`). Por clave: producto (`XXXX`), generico,
forma farmaceutica, concentracion del principio activo en unidad canonica (mg,
mcg, UI, mL, %) y cuantos envases tiene el producto. Las columnas del PDF se
enciman de forma irregular, asi que la lectura es conservadora y marca como
**incompleta** cualquier clave que no pueda atribuir sin ambiguedad:

- un bloque de descripcion con claves de productos distintos;
- un generico que no aparece en la linea "Cada ... contiene";
- una clave repetida en el documento con lecturas que no coinciden;
- combinaciones (`/`, `,`, "compuesta").

Los envases de un mismo producto son la misma presentacion: un envase ilegible
toma la lectura de sus hermanos cuando todos coinciden.

## Como lo usa la app

`src-tauri/src/cnis.rs` pone la clave solo si la coincidencia es exacta y unica:
un solo generico en la linea y sin combinaciones, la concentracion escrita igual
a la del compendio (sin "mg/5 mL"), un solo producto con ese generico, forma y
concentracion, ninguna entrada ilegible que pudiera ser la misma, un solo envase
y ninguna contradiccion con la forma escrita (por ejemplo, "liberacion
prolongada" debe estar escrito si el compendio lo dice). Ante la duda no hay
clave; el texto de la receta siempre va.
