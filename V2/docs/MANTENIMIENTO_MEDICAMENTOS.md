# Mantenimiento de la base de medicamentos (paso 33, etapa 6)

La base de medicamentos de la app son cinco tablas que viven en el repositorio y van
empaquetadas en el instalador. La app nunca descarga nada de esto: se actualiza con
cada versión. Todo es referencia pública, sin datos de pacientes.

| Tabla (`desktop-app/src-tauri/src/reference_data/`) | Se genera con | Fuente que se edita a mano | Quién revisa |
|---|---|---|---|
| `cnis.csv` | `npm run cnis:build` | `scripts/cnis/correcciones.csv`, `scripts/cnis/bajas.csv` | Farmacéutico |
| `ingredients.csv` | `npm run ingredients:build` | `scripts/ingredients/sinonimos.csv` | Farmacéutico |
| `brands.csv` | `npm run brands:build` | `scripts/brands/marcas.csv` | Farmacéutico |
| `contraindications.csv` | `npm run contraindications:build` | `scripts/contraindications/reglas.csv` | Médico piloto y farmacéutico |
| `medications.csv`, `interactions.csv` (paso 25) | `npm run medication:build` | `scripts/medication-reference` | Farmacéutico |

Ninguna fila escrita a mano entra sin **fuente o motivo y revisor**: los scripts fallan si falta.

## Orden para regenerar

Cada tabla usa la anterior, así que siempre en este orden:

```bash
npm run cnis:build
npm run ingredients:build
npm run brands:build
npm run contraindications:build
```

Después, en `V2/desktop-app/src-tauri`: `cargo test --lib`. Revisar el diff de las tablas en el
PR antes de fusionar: `cnis:build` imprime qué filas son nuevas, cuáles se retiraron y cuáles
cambiaron.

## Actualizaciones del CNIS en el DOF

El Consejo de Salubridad General no publica una edición nueva cada vez: publica en el DOF
**acuerdos de actualización** de la edición vigente (altas, modificaciones y bajas de claves,
mezclando medicamentos con otros insumos).

- **Aviso automático:** el flujo `Actualizaciones del CNIS` de GitHub corre cada lunes y queda en
  rojo mientras haya acuerdos sin aplicar. GitHub solo corre los horarios desde `main`.
- **A mano:** `npm run cnis:check` revisa el DOF día por día (edición matutina y las demás del día)
  desde la última fecha revisada y registra cada acuerdo en `scripts/cnis/actualizaciones.json`
  con su liga y las claves de medicamento (grupos 010 a 040) que menciona.

Para aplicar un acuerdo pendiente:

1. Abrir su liga en el DOF y revisar sus tablas de medicamentos con el farmacéutico.
2. **Altas y modificaciones:** una fila por clave en `scripts/cnis/correcciones.csv` (clave,
   genérico, forma, concentración, unidades del envase, motivo `Acuerdo DOF dd/mm/aaaa`, revisor).
3. **Bajas:** una fila por clave en `scripts/cnis/bajas.csv` (clave, motivo, revisor).
4. En `actualizaciones.json`, cambiar su `status` a `aplicada` (o `no aplica` si no toca
   medicamentos) y llenar `reviewedBy` y `notes`. El revisor falla si un acuerdo cerrado no dice
   quién lo revisó.
5. Regenerar en el orden de arriba y abrir un PR.

Cuando el CSG publique una **edición nueva completa** del compendio: cambiar `EDITION` y `PDF_URL`
en `scripts/cnis/build.ts`, regenerar, revisar el diff completo, y empezar
`actualizaciones.json` de nuevo con la fecha de la edición (las correcciones y bajas que la
edición ya incluya se retiran de sus archivos).

## Cadencia sugerida

- **Cada semana:** el aviso de GitHub. Si está en rojo, aplicar los acuerdos pendientes.
- **Cada mes:** revisar `scripts/ingredients/por-revisar.csv` y sumar marcas al núcleo curado.
- **Cada trimestre:** revisar las reglas de contraindicaciones con el médico piloto (nuevas
  propuestas en `scripts/contraindications/propuestas.csv` tras regenerar el CNIS).
- **Cada versión de la app:** las tablas viajan con el instalador; anotar en las notas de la
  versión qué edición y qué acuerdos del CNIS incluye.
