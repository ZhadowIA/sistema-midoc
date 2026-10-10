# Catalogo CIE-10 (paso 28, rebanada 2)

Genera el catalogo de diagnosticos que la app empaqueta para codificar la nota.
Corre **fuera de la app** y no ve datos de pacientes.

## Fuente y licencia

"Catalogo CIE-10" de la Secretaria de Salud, publicado en
[datos.gob.mx](https://www.datos.gob.mx/dataset/catalogo_cie_10) y mantenido por
el Hospital Juarez de Mexico, bajo **Creative Commons Attribution 4.0 (CC BY 4.0)**.
La licencia permite uso comercial con atribucion: la app muestra la fuente y la
licencia junto al selector de diagnosticos (`cie10_catalog_info`).

No se usa el archivo de la OMS directamente: su licencia (CC BY-ND) prohibe
adaptaciones, y el catalogo nacional ademas trae lo que la app aprovecha
(restriccion por sexo, limites de edad y validez en consulta externa).

## Uso

```bash
npm run test:cie10   # pruebas de la transformacion
npm run cie10:build  # descarga y regenera src-tauri/src/reference_data/cie10.csv y cie10.manifest.json
```

La descarga va por el API de datos (`datastore_search`) porque el archivo
directo rechaza clientes que no son navegador.

## Que se conserva

Solo codigos vigentes (`VALID = SI`) y no borrados por las actualizaciones de la
OMS (`RUBRICA_TYPE` distinto de `B`). Por codigo: clave sin punto, nombre oficial,
sexo, limites de edad en dias y validez en consulta externa. El catalogo oficial
no incluye las categorias de 3 caracteres que tienen subdivisiones: se codifica
con la subcategoria (J45.0 ... J45.9).
