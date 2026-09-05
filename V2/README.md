# MiDoc V2

Esta carpeta contiene **el sistema V2 completo**: la documentacion de levantamiento y analisis, y las dos aplicaciones que forman el producto. Nacio como base documental previa al rediseño; hoy la documentacion convive con el codigo y se actualiza junto con el.

## Que hay aqui

| Carpeta | Que es |
|---|---|
| `consultorio-app/` | **Portal nube** (Next.js 16 + PostgreSQL minimo): agenda publica, cuenta del paciente, buzon cifrado temporal, notificaciones y suscripcion. |
| `desktop-app/` | **App del medico** (Tauri 2 + React + SQLite cifrado): expediente, consulta, receta, odontologia, IA gobernada, caja y recepcion. Aqui vive todo lo clinico. |
| `docs/` | Planes de implementacion, disenos por paso y documentacion operativa. |
| `design-propuesta/` | Propuestas visuales y canvas de rediseño. |
| `anexos/`, `tools/` | Anexos de factibilidad e IEEE 830, y el generador del PDF. |
| `01..15_*.md` | Documentacion funcional: levantamiento, analisis, linea de desarrollo y planes. |

## Orden de lectura

1. `01_contexto_v2.md` — contexto y decision de arquitectura local-first.
2. `02_recoleccion_informacion.md`
3. `03_clasificacion_requerimientos.md`
4. `04_validacion_requerimientos.md`
5. `05_requerimientos_funcionales.md`
6. `06_casos_uso_dcu.md`
7. `07_capacidades_heredadas_y_alcance.md`
8. `08_recomendaciones_produccion.md`
9. `09_contraste_v1_v2.md`
10. `10_linea_de_desarrollo.md` — **el documento vivo**: estado por paso, compuertas y lo entregado.
11. `11_recomendaciones_ia_medica.md`
12. `12_inventario_funcional_v1.md`
13. `13_contrato_sincronizacion.md`
14. `14_plan_estaciones_y_roles.md` — estaciones y separacion de roles (paso 27).
15. `15_plan_datos_de_uso.md` — datos de uso del producto.
16. `anexos/01_factibilidad_resumen.md`, `anexos/02_ieee_830_resumen.md`

Reglas obligatorias de trabajo: `REGLAS_DESARROLLO.md`. Contexto para retomar el desarrollo: `docs/HANDOFF.md`.

## Decision de arquitectura vigente

V2 es local-first (decision 2026-06-09): app de escritorio instalable (Tauri 2 + SQLite cifrado) para todo lo clinico, y portal nube minimo (Next.js) para agenda publica, buzon temporal, notificaciones y suscripcion. Ningun dato clinico se persiste de forma permanente en la nube. Detalle en `01_contexto_v2.md`. El codigo de V1 esta congelado como referencia en `../V1/`.

## Arranque local

Cada aplicacion se instala y corre por separado; no hay workspace compartido todavia.

```bash
# Portal nube (necesita PostgreSQL y un .env.local; ver consultorio-app/.env.example)
cd consultorio-app
npm install
npm run db:migrate:dev
npm run dev                 # http://localhost:3000
npm run lint && npm test    # unitarias + integracion

# App del medico (necesita la cadena de build nativa; ver desktop-app/README.md)
cd ../desktop-app
npm install
npm run tauri:dev
npm run lint && npm test
cd src-tauri && cargo test && cargo clippy
```

Desde esta carpeta, `npm run dev:app`, `npm test` y `npm run lint` son atajos que delegan en `consultorio-app`.

## Entregable PDF

El PDF de la documentacion se genera en `MiDoc_V2_Documentacion.pdf`:

```powershell
python -m pip install -r V2/tools/requirements.txt
python V2/tools/generate_pdf.py
```

## Alcance de la documentacion funcional

- Tecnica de recopilacion de informacion: entrevista, cuestionario y observacion.
- Clasificacion y validacion de requerimientos, y tabla de requerimientos funcionales.
- Casos de uso documentados para paciente, medico familiar/general y dentista, con su diagrama.
- Capacidades heredadas de V1 a conservar, diferir u omitir, y contraste completo con V2.
- Linea de desarrollo por pasos, con compuertas, MVP y criterios de avance.
- Recomendaciones de IA medica, proveedores, benchmark y arquitectura multi-proveedor.
- Contrato de sincronizacion, plan de estaciones y roles, y plan de datos de uso.
- Recomendaciones de despliegue a produccion y anexos de factibilidad e IEEE 830.
