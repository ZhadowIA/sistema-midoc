# MiDoc V2 - Documentacion de levantamiento y analisis

Este directorio contiene la documentacion base para iniciar MiDoc V2. El contenido se elaboro a partir del sistema actual y de la nueva decision de producto: agenda y expediente ya no se tratan como modulos separados, sino como un paquete integrado de atencion clinica.

## Orden de lectura

1. `01_contexto_v2.md`
2. `02_recoleccion_informacion.md`
3. `03_clasificacion_requerimientos.md`
4. `04_validacion_requerimientos.md`
5. `05_requerimientos_funcionales.md`
6. `06_casos_uso_dcu.md`
7. `07_capacidades_heredadas_y_alcance.md`
8. `08_recomendaciones_produccion.md`
9. `09_contraste_v1_v2.md`
10. `10_linea_de_desarrollo.md`
11. `11_recomendaciones_ia_medica.md`
12. `12_inventario_funcional_v1.md`
13. `anexos/01_factibilidad_resumen.md`
14. `anexos/02_ieee_830_resumen.md`

Reglas obligatorias de trabajo: `REGLAS_DESARROLLO.md`.

## Decision de arquitectura vigente

V2 es local-first (decision 2026-06-09): app de escritorio instalable (Tauri 2 + SQLite cifrado) para todo lo clinico, y portal nube minimo (Next.js) para agenda publica, buzon temporal, notificaciones y suscripcion. Detalle en `01_contexto_v2.md`. El codigo de V1 esta congelado como referencia en `../V1/`.

## Entregable PDF

El PDF final se genera en:

`MiDoc_V2_Documentacion.pdf`

Para regenerarlo:

```powershell
python -m pip install -r V2/tools/requirements.txt
python V2/tools/generate_pdf.py
```

## Alcance

Incluye:

- Tecnica de recopilacion de informacion: entrevista, cuestionario y observacion.
- Clasificacion de requerimientos funcionales y no funcionales.
- Validacion de requerimientos.
- Tabla de requerimientos funcionales.
- Casos de uso documentados para paciente, medico familiar/general y dentista.
- Diagrama de casos de uso con dos actores: Medico y Paciente.
- Tabla de capacidades heredadas a conservar, diferir u omitir.
- Contraste completo entre sistema anterior y requerimientos V2.
- Linea de desarrollo por pasos, compuertas, MVP y criterios de avance.
- Recomendaciones de IA medica, proveedores, benchmark y arquitectura multi-proveedor.
- Notificaciones por correo y recuperacion de cuentas.
- Recomendaciones de despliegue a produccion.
- Anexos breves de factibilidad e IEEE 830.

No incluye implementacion de codigo V2. Esta carpeta es una base documental previa al rediseño y levantamiento formal del sistema.

## Estructura de implementacion V2

La implementacion de V2 parte de este mismo repositorio. La documentacion funcional permanece en la raiz y `consultorio-app/` sera la primera aplicacion del sistema.

```text
V2/
├── consultorio-app/      # Portal nube (Next.js)
├── desktop-app/          # App del medico (Tauri 2) — se crea en paso 0
├── docs/superpowers/plans/
├── 01_contexto_v2.md
├── 10_linea_de_desarrollo.md
├── 12_inventario_funcional_v1.md
├── REGLAS_DESARROLLO.md
└── documentacion funcional existente
```

## Arranque local esperado

1. `npm install`
2. `npm run dev:app`
3. `npm test`
