# Nucleo curado de marcas (paso 33, etapa 3)

Marcas comerciales desglosadas en los ingredientes del catalogo canonico
(`scripts/ingredients`). La app las lee de `src-tauri/src/reference_data/brands.csv`
(`src-tauri/src/brands.rs`). Corre fuera de la app, sin red, y no ve datos de pacientes.

## Uso

```bash
npm run test:brands   # pruebas
npm run brands:build  # valida marcas.csv y regenera brands.csv y su manifiesto
```

Correr despues de `npm run ingredients:build`.

## Como se llena

`marcas.csv` es el nucleo **revisado**: solo entran marcas con fuente y revisor.

```csv
marca,ingredientes,laboratorio,fuente,revisado_por
Tempra,paracetamol,<laboratorio>,<IPP COFEPRIS o PLM, edicion>,<nombre del farmaceutico>
```

- `ingredientes`: ids de `reference_data/ingredients.csv`, separados por `+` para
  combinaciones (`paracetamol + cafeina`). El build falla si alguno no existe.
- Una marca no puede llamarse como un ingrediente ni repetirse.
- Candidatas: las marcas listadas en `scripts/ingredients/por-revisar.csv` (vienen de la
  base de interacciones del paso 25). Al pasarlas aqui dejan de pedirse alla.
- Meta inicial del diseno: las 500 a 1,000 marcas mas recetadas.

## Altas del medico

Cuando la receta escribe una dosis con un nombre que la app no conoce ("Fictimed 500 mg"),
la consulta pregunta que contiene. La respuesta se guarda solo en la base cifrada de ese
medico (`local_brands`), nunca se sincroniza, y se revisa o borra en Mis datos > Mis marcas.
No pasa por este nucleo.
