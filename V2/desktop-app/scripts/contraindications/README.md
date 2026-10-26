# Medicamento contra padecimiento (paso 33, etapa 5)

Reglas que cruzan un principio activo de la receta con los diagnosticos CIE-10 del
paciente. La app las lee de `src-tauri/src/reference_data/contraindications.csv`
(`src-tauri/src/contraindications.rs`). Corre fuera de la app, sin red, y no ve datos de
pacientes.

**Va tras el interruptor de la seguridad farmacologica** (`MIDOC_MEDICATION_SAFETY`):
apagada en el instalador que se vende hasta la respuesta de COFEPRIS.

## Uso

```bash
npm run test:contraindications   # pruebas
npm run contraindications:build  # valida reglas.csv y regenera la tabla de la app
```

Correr despues de `npm run ingredients:build`.

## Como se llenan

`reglas.csv` solo lleva reglas **revisadas** por el medico piloto y el farmaceutico:

```csv
ingrediente,cie10,padecimiento,gravedad,recomendacion,fuente,revisado_por
ibuprofeno,K25,Úlcera gástrica,contraindicada,"Evitar AINE; considerar paracetamol",CNIS 2025-04-26 (ibuprofeno),<revisor>
```

- `ingrediente`: id de `reference_data/ingredients.csv`.
- `cie10`: clave sin punto o el inicio de un grupo (`N18` cubre N180 a N189). Debe existir
  en el catalogo CIE-10.
- `gravedad`: `contraindicada` (alerta grave: pide confirmar antes de firmar) o
  `precaucion` (solo avisa).
- `fuente` y `revisado_por`: obligatorios; sin ellos la regla no entra.

Materia prima: `propuestas.csv`, que `npm run cnis:build` genera con el apartado
"Contraindicaciones y Precauciones" de cada generico del CNIS. **No son reglas**: quien
revise decide cuales se vuelven regla, con que diagnostico CIE-10 y que gravedad.

## Como lo usa la app

- En la receta (con el interruptor encendido), "Medicamento y padecimientos del paciente"
  muestra contraindicaciones y precauciones contra los diagnosticos CIE-10 de esta
  consulta y de las anteriores. Los antecedentes en texto libre no se interpretan.
- Al firmar, las alertas graves de la receta guardada (contraindicaciones, alergias e
  interacciones contraindicadas o mayores) se confirman antes; Rust no firma sin esa
  confirmacion. La bitacora guarda solo una huella, sin nombres de farmacos ni
  diagnosticos. Si despues aparece una alerta grave nueva, se vuelve a pedir.
