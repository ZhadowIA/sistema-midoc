# Reglas de desarrollo de MiDoc V2

Vigentes desde: 2026-06-09. Estas reglas son obligatorias para todo cambio en `V2/`. Complementan la linea de desarrollo (`10_linea_de_desarrollo.md`); ante conflicto, gana la regla mas restrictiva.

## 1. Principios

1. **El paso actual manda.** Toda tarea se ubica primero en un paso de la linea de desarrollo. Si pertenece a un paso futuro, se documenta y no se implementa.
2. **Local-first es invariante de arquitectura, no preferencia.** Ningun cambio puede hacer que un dato clinico se persista en la nube de forma permanente. Si un diseño lo requiere, el diseño esta mal.
3. **Flujo manual antes que IA.** Ninguna funcion clinica depende de IA para completarse.
4. **V1 es referencia, no dependencia.** Se puede leer `V1/` para entender reglas de negocio, pero no se importa codigo de V1 directamente; se reimplementa con las convenciones de V2.

## 2. Estructura del repositorio

```text
Sistema MiDoc/
├── V1/                      # Codigo V1 congelado. Solo lectura: no se modifica ni se despliega.
└── V2/
    ├── consultorio-app/     # Portal nube (Next.js + PostgreSQL minimo)
    ├── desktop-app/         # App del medico (Tauri 2 + React + SQLite cifrado) — se crea en paso 0
    ├── docs/                # Planes de implementacion
    ├── anexos/
    ├── tools/
    ├── 01..12_*.md          # Documentacion de levantamiento y analisis
    └── REGLAS_DESARROLLO.md # Este documento
```

Reglas:

- Nada nuevo se agrega a `V1/`. Los fixes de V1 no existen: V1 no se mantiene.
- Codigo compartido entre portal y app (tipos, esquemas Zod, contratos de sincronizacion) vive en un paquete comun (`V2/shared/` cuando exista la necesidad real, no antes).
- Ningun archivo `.env`, base de datos local, dump, respaldo o credencial se commitea. Verificar `.gitignore` antes del primer commit de cada proyecto nuevo.

## 3. Lenguaje y estilo de codigo

- **TypeScript estricto** (`strict: true`) en portal y app. Prohibido `any` salvo justificacion en comentario; preferir `unknown` + narrowing.
- **Validacion en las fronteras.** Toda entrada externa (request HTTP, payload de sincronizacion, archivo importado, salida de IA) se valida con Zod antes de tocar logica de dominio.
- **Capas:** route handlers / componentes UI no contienen logica de negocio; delegan a servicios de dominio (`src/services/`). Los servicios no conocen HTTP ni UI.
- **Fechas:** siempre con utilidades centralizadas de fecha/zona horaria; nunca aritmetica manual de `Date` dispersa. La zona horaria del medico es dato de configuracion, no supuesto del servidor.
- **Errores:** los servicios lanzan errores tipados de dominio; la capa de transporte los traduce a respuestas. Nunca exponer mensajes internos ni stack traces al cliente.
- Nombres de codigo en ingles; textos de UI y documentacion funcional en español.

## 4. Datos sensibles (regla de oro)

1. Datos clinicos (notas, diagnosticos, recetas, documentos, respuestas de preconsulta) **solo** se persisten en la base local cifrada de la app del medico, o transitoriamente en el buzon cifrado de la nube con expiracion y purga.
2. **Prohibido registrar contenido clinico en logs**, telemetria, mensajes de error, analytics o trazas de IA — en ambas aplicaciones. Los logs referencian IDs, nunca contenido.
3. Todo envio a servicios de terceros (IA en nube, SMS, correo) lleva el minimo de datos: para IA, contenido seudonimizado y con consentimiento registrado; para notificaciones, solo nombre, contacto y datos de cita.
4. Toda nueva tabla o campo se clasifica al diseñarse: `CLINICO` (solo local/buzon), `CONTACTO` (nube minima) u `OPERATIVO` (segun residencia). La clasificacion se anota en el esquema.
5. Tokens y enlaces publicos (cuestionario, carga de estudios, acciones de cita) siempre tienen expiracion, un solo proposito y auditoria de uso.

## 5. Pruebas

- Cada servicio de dominio tiene pruebas unitarias. Cada endpoint y comando de sincronizacion tiene al menos una prueba de integracion del camino feliz y una de rechazo (sin permiso / payload invalido).
- Logica critica de concurrencia (holds, doble reserva, purga de buzon, conflictos de sync) requiere pruebas especificas de carrera/duplicado.
- Las pruebas no dependen de servicios externos reales: IA, SMS y correo se prueban contra fakes/mocks; el contrato real se prueba en staging.
- Una funcionalidad sin pruebas no esta terminada, aunque "funcione".

## 6. Migraciones y datos

- Esquema solo cambia via migraciones versionadas (Prisma en portal; migraciones SQLite versionadas en la app). Nunca editar el esquema productivo a mano.
- Las migraciones de la app del medico deben ser **siempre compatibles hacia adelante**: la app se auto-actualiza en equipos de medicos y una migracion fallida no puede dejar la base clinica corrupta. Toda migracion local corre dentro de transaccion y con respaldo previo automatico.
- Datos de semilla solo para desarrollo; jamas semillas con datos personales reales.

## 7. Git y flujo de trabajo

Se aplica el flujo definido en `10_linea_de_desarrollo.md` (seccion "Buenas practicas de Git"). Resumen operativo:

- Rama corta por unidad de trabajo: `v2/<paso>-<descripcion>` (ej. `v2/paso3-hold-temporal`). Nunca trabajar directo sobre `main` ni `dev`.
- Commits pequeños, una intencion por commit, formato `tipo: descripcion` (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Antes de cada push: lint, tipos, pruebas y build del proyecto tocado.
- Integracion a `dev` via pull request con revision; `main` solo recibe merges desde `dev` validado.
- Prohibido force push a ramas compartidas y prohibido `--no-verify`.

## 8. Definicion de terminado (Definition of Done)

Un cambio esta terminado cuando:

1. Cumple el criterio de validacion del paso al que pertenece.
2. Tiene pruebas (regla 5) y todas pasan.
3. Lint y tipos pasan sin warnings nuevos.
4. No introduce datos clinicos en nube, logs ni telemetria (regla 4).
5. Las migraciones aplican desde cero y sobre una base existente.
6. La documentacion afectada se actualizo en el mismo PR (este documento, `01_contexto_v2.md`, contratos de API o el doc del paso).
7. Si toca sincronizacion, respaldo o cifrado: se probo el camino de fallo (red caida a mitad de sync, restauracion de respaldo, llave incorrecta).

## 9. Dependencias

- Agregar una dependencia requiere justificacion en el PR: que problema resuelve y por que no se resuelve con lo ya instalado.
- Preferir dependencias mantenidas y auditables; prohibido depender de APIs no oficiales o scraping (leccion de V1: whatsapp-web.js).
- Revisar licencias: nada copyleft incompatible con distribucion comercial de la app instalable.

## 10. Trabajo asistido por IA (Claude/Codex)

- Antes de escribir codigo Next.js, consultar `node_modules/next/dist/docs/` (Next.js 16 tiene cambios que rompen convenciones anteriores).
- Toda salida de agente se revisa contra estas reglas antes de commitear; el agente debe correr las verificaciones de la regla 8 y reportar resultados reales.
- Ubicar cada tarea de agente en un paso de la linea de desarrollo y declararlo al inicio del trabajo.

## 11. Cambios a estas reglas

Las reglas cambian por PR que modifique este archivo, con justificacion en la descripcion. Si una regla estorba repetidamente, se discute y se cambia; no se ignora en silencio.
