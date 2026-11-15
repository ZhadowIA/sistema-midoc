# Catalogo de ingredientes canonicos (paso 33, etapa 2)

Una sola identidad por principio activo que une:

- su generico del **CNIS** (`reference_data/cnis.csv`): id y nombre a mostrar, con acentos;
- su clave en la **base de interacciones** actual (`reference_data/medications.csv`, en ingles);
- los **nombres** con los que se reconoce en la receta.

La app lo lee de `src-tauri/src/reference_data/ingredients.csv` (`src-tauri/src/ingredients.rs`).
Corre fuera de la app, sin red, y no ve datos de pacientes.

## Uso

```bash
npm run test:ingredients   # pruebas
npm run ingredients:build  # regenera ingredients.csv, su manifiesto y por-revisar.csv
```

Regenerar despues de cada `npm run cnis:build` o cambio de la base de interacciones.

## Reglas

- Cada generico del CNIS de un solo principio activo es un ingrediente. Las combinaciones no.
- La liga con la base de interacciones se hace sola **solo por nombre exacto** e inequivoco
  ("paracetamol" en los dos lados). Lo que no coincide queda como ingrediente aparte (por
  ejemplo "Aspirina", que en el CNIS es "Ácido acetilsalicílico").
- Las variantes y marcas de la base ("acetaminofen", "tempra") **no se usan** hasta que una
  persona las revise: se listan en `por-revisar.csv`.
- `sinonimos.csv` agrega nombres revisados (ingrediente, sinonimo, **motivo y quien lo
  reviso**). Si el sinonimo es un nombre de la base de interacciones, tambien liga ambos
  (`acido acetilsalicilico,aspirina,...` une el generico con la clave `aspirin`).
- Un nombre que apuntara a dos ingredientes sale de ambos y se reporta.

## Quien lo usa

- **FHIR**: una linea de la receta abre un medicamento si nombra un ingrediente (antes, solo
  si estaba en la base de interacciones).
- **CNIS**: los sinonimos revisados encuentran su generico ("acetaminofen 500 mg" -> paracetamol).
- **Revision de seguridad** (tras el interruptor): un nombre que la base no tiene con esa
  escritura se resuelve por su ingrediente ("Paroxetina" -> `paroxetine`).
