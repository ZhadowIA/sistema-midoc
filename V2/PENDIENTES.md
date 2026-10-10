# Pendientes V2

Lista viva de lo que sale durante el trabajo y no se resuelve en el momento. Cada pendiente nace con fecha y origen; al resolverlo se mueve a "Resueltos" con la fecha y el PR o commit que lo cerro. Lo que ya es un paso de la linea (`10_linea_de_desarrollo.md`) no se duplica aqui.

## Decisiones de producto

- [ ] **Ordenes de laboratorio dental** — ¿siguen activas bajo el reenfoque o se congelan con Recepcion? Por ahora siguen activas dentro de la consulta dental, pero la vista global de trabajos pendientes vivia en Recepcion y con la bandera apagada ya no se ve en ningun lado. _(2026-09-07, reenfoque; actualizado 2026-10-05, paso 27)_
- [ ] **Avisos al propio medico** — que sobrevive de notificaciones cuando el destinatario es el medico y no el paciente. _(2026-09-07, reenfoque)_
- [ ] **Precios del nuevo modelo** — licencia, renovacion de actualizaciones, paquetes de creditos y plan mensual; tambien equipos por licencia y periodo de parches criticos. Ver `15_modelo_de_negocio.md` seccion 5. _(2026-09-07, reenfoque; replanteado 2026-10-06)_
- [ ] **Revision fiscal y de consumidor antes de cobrar** — CFDI por cada cobro, creditos como ingreso diferido, y que las recargas no caduquen (PROFECO). Con contador. _(2026-10-06, modelo de negocio)_
- [ ] **Rama `v2/preconsulta-por-servicio`** — local, sin push ni PR, 2 commits (`76643c1` preconsulta guiada opcional por servicio en el portal; `7a62618` configuracion como destino unico y menu de cuatro secciones en el desktop). La preconsulta queda congelada por el reenfoque; decidir si se rescata el commit del menu y si se descarta el resto. Su migracion `20260724000000_service_requires_preconsulta` ya esta aplicada en la base local de desarrollo aunque no exista en `dev`. _(2026-10-05)_
- [ ] **Entrada "Consulta" en la navegacion** — el paso 27 la lista, pero la consulta nace del paciente y no hay una vista que liste consultas abiertas. Decidir si se agrega "Consultas abiertas" o se quita del paso. _(2026-10-05, paso 27)_

## Deuda tecnica

- [ ] **Retirar `PaymentRecord`, `CashDrawerSession` y `WaitlistEntry` del portal** — vestigio del commit `0bc949e`, sin referencias en `src/` ni `tests/`; la caja y la lista de espera viven en la app del medico. Rama aparte. _(2026-09-05, PR #43)_
- [ ] **`open_patient_encounter` siempre crea una consulta nueva** — no reutiliza una consulta abierta del mismo paciente, asi que un doble clic o volver a entrar deja consultas vacias en estado OPEN. Ahora es la entrada principal, no la secundaria. _(2026-10-05, paso 27)_
- [ ] **El mock del navegador (`ipc.ts`) tiene una sola consulta fija** — `open_patient_encounter` devuelve siempre la de Hugo, sin importar el paciente; estorba para verificar flujos en el navegador. _(2026-10-05, paso 27)_
- [ ] **Escape no cierra la vista previa de un PDF** — el visor de WebView2 retiene el teclado; se cierra con "Cerrar" o clic fuera. En imagenes si funciona. _(2026-10-05, paso 28 r1)_
- [ ] **Arrastrar archivos desde el Explorador no se probo en la app real** — la prueba automatizada no puede arrastrar desde el Explorador; se verifico el soltar en el navegador y el selector de archivos en la app real. Probarlo a mano una vez. _(2026-10-05, paso 28 r1)_
- [ ] **El visor de PDF permite descargar el archivo descifrado** — es una accion del medico y no viaja a la red, pero deja una copia en claro fuera de la base cifrada. Decidir si se oculta la barra del visor o se acepta como salida deliberada. _(2026-10-05, paso 28 r1)_
- [ ] **Los diagnosticos ya elegidos no muestran los avisos del catalogo** — el aviso de sexo, edad o consulta externa sale en los resultados de busqueda, no en la lista de la nota; si cambian los datos del paciente despues, no se vuelve a avisar. _(2026-10-06, paso 28 r2)_
- [ ] **El historial del expediente solo muestra el diagnostico en texto libre** — los codigos CIE-10 no aparecen en "Historial" ni en el resumen de consultas; entra natural con la busqueda (r3) o el PDF (r4). _(2026-10-06, paso 28 r2)_
- [ ] **La receta impresa no cubre todos los requisitos legales** — lleva nombre, cedula, paciente, fecha y medicamentos, pero el Reglamento de Insumos para la Salud tambien pide domicilio del consultorio, institucion que expidio el titulo y especialidad (con su cedula si aplica), y para menores la edad. Esos datos no existen todavia en la cuenta del portal. _(2026-10-06, paso 28 r4)_
- [ ] **El PDF y el FHIR no incluyen la plantilla de especialidad ni la historia clinica estructurada** — ni el odontograma/plan dental ni la plantilla de medicina general ni los antecedentes estructurados del paso 19; solo los antecedentes en texto libre. En FHIR el odontograma pediria `Observation`/`Procedure` por pieza o un perfil propio. _(2026-10-06, paso 28 r4; ampliado en r5)_
- [ ] **"Guardar como" abre la primera vez en la carpeta de trabajo del proceso** — en desarrollo cae en `src-tauri/`; instalada, en la carpeta desde donde se lance. Windows recuerda despues la ultima carpeta. `rfd` fija la carpeta con `SetFolder`, asi que forzar "Documentos" pisaria esa memoria: decidir si se fija solo cuando no hay carpeta previa (guardandola en `app_meta`). Afecta PDF y FHIR. _(2026-10-06, paso 28 r5)_
- [ ] **Medicamentos sin codificar en FHIR** — `MedicationRequest` lleva el medicamento como texto; la referencia local no tiene claves (ATC, Compendio Nacional de Insumos). Un medicamento que no esta en la referencia queda dentro de las indicaciones del anterior; el texto integro de la receta viaja en la nota. _(2026-10-06, paso 28 r5)_
- [ ] **La portabilidad ARCO sigue exportando su JSON propio** — el paso 28 propone FHIR para la portabilidad; decidir si la solicitud ARCO de portabilidad entrega el FHIR del expediente (`fhir::export_record`) en lugar de `arco::export_patient_data`. _(2026-10-06, paso 28 r5)_
- [ ] **Validacion con el validador oficial de HL7** — las pruebas validan contra el esquema JSON de R4, que revisa estructura y tipos pero no invariantes ni terminologias; los codigos se confirmaron una vez en tx.fhir.org. Correr `validator_cli.jar` (Java ya esta instalado; el jar pesa ~200 MB) sobre una exportacion antes de declarar interoperabilidad con un sistema concreto. _(2026-10-06, paso 28 r5)_
- [ ] **El FHIR se arma completo en memoria** — con documentos dentro (hasta 20 MB cada uno, en base64) un expediente con muchos estudios pesados ocupa varias veces su tamano al exportar. Si llega a estorbar, escribir el Bundle en flujo. _(2026-10-06, paso 28 r5)_
- [ ] **PDF/A para archivo** — la decision del paso 28 menciona PDF/A al archivar; hoy se genera PDF normal (pdf-lib no produce PDF/A). _(2026-10-06, paso 28 r4)_
- [ ] **CI en GitHub** — los PRs no reportan checks; hoy todo se verifica a mano en local. _(2026-10-05)_

## Trabajo abierto

- [ ] **PR #41, odontograma doble vista por diente** — abierto desde 2026-07-17, sin revisar. _(2026-10-05)_
- [ ] **Paso 22, diarizacion** — falta compilar nativo con `--features diarization-local`, prueba e2e con audio real, fijar los `MIDOC_DIARIZE_*_SHA256` y rehospedar los `.onnx` con sus licencias. _(2026-06-18)_

## Resueltos

- [x] **¿La app debe funcionar sin vincular cuenta?** — Se activa una vez vinculando la cuenta; despues funciona sin conexion con una licencia firmada. La vinculacion solo hace falta para activar, creditos de IA y actualizaciones; nombre y cedula bajan del portal y quedan en el equipo. Decidido 2026-10-06 con el modelo de compra unica (`15_modelo_de_negocio.md`), que reemplaza la respuesta anterior ("requiere estar vinculada por la suscripcion").
- [x] **Modelo de negocio** — compra unica con 12 meses de actualizaciones + creditos de IA (recargas sin caducidad y plan mensual opcional). Decidido 2026-10-06, `15_modelo_de_negocio.md`.

- [x] **Formato de exportacion del expediente** — PDF, despues FHIR R4 (JSON), despues CSV del directorio; Word fuera de la exportacion oficial; CIE-10 dentro del paso 28. Decidido 2026-10-05, en `10_linea_de_desarrollo.md` (paso 28).
- [x] **La receta no lleva nombre ni cedula del medico** — absorbido por el paso 28, rebanada 4 (2026-10-05).

- [x] **3 pruebas de integracion del portal fallando en `dev`** (cola de notificaciones, DST de agenda publica, creditos de IA) — PR #42, 2026-10-05.
- [x] **Expediente clinico persistido en PostgreSQL** — PR #43, 2026-10-05.
