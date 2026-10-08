# Pendientes V2

Lista viva de lo que sale durante el trabajo y no se resuelve en el momento. Cada pendiente nace con fecha y origen; al resolverlo se mueve a "Resueltos" con la fecha y el PR o commit que lo cerro. Lo que ya es un paso de la linea (`10_linea_de_desarrollo.md`) no se duplica aqui.

## Decisiones de producto

- [ ] **Ordenes de laboratorio dental** — ¿siguen activas bajo el reenfoque o se congelan con Recepcion? Por ahora siguen activas dentro de la consulta dental, pero la vista global de trabajos pendientes vivia en Recepcion y con la bandera apagada ya no se ve en ningun lado. _(2026-09-07, reenfoque; actualizado 2026-10-05, paso 27)_
- [ ] **Avisos al propio medico** — que sobrevive de notificaciones cuando el destinatario es el medico y no el paciente. _(2026-09-07, reenfoque)_
- [ ] **Formato de exportacion del expediente** — necesario para el paso 28. _(2026-09-07, reenfoque)_
- [ ] **Precio del plan sin agenda** — necesario para el paso 29. _(2026-09-07, reenfoque)_
- [ ] **Rama `v2/preconsulta-por-servicio`** — local, sin push ni PR, 2 commits (`76643c1` preconsulta guiada opcional por servicio en el portal; `7a62618` configuracion como destino unico y menu de cuatro secciones en el desktop). La preconsulta queda congelada por el reenfoque; decidir si se rescata el commit del menu y si se descarta el resto. Su migracion `20260724000000_service_requires_preconsulta` ya esta aplicada en la base local de desarrollo aunque no exista en `dev`. _(2026-10-05)_
- [ ] **¿La app debe funcionar sin vincular cuenta?** — hoy todo el expediente queda detras del formulario de vinculacion. El paso 29 pide que un medico sin plan pueda documentar a mano; decidir si eso incluye "sin cuenta". _(2026-10-05, paso 27)_
- [ ] **Entrada "Consulta" en la navegacion** — el paso 27 la lista, pero la consulta nace del paciente y no hay una vista que liste consultas abiertas. Decidir si se agrega "Consultas abiertas" o se quita del paso. _(2026-10-05, paso 27)_

## Deuda tecnica

- [ ] **Retirar `PaymentRecord`, `CashDrawerSession` y `WaitlistEntry` del portal** — vestigio del commit `0bc949e`, sin referencias en `src/` ni `tests/`; la caja y la lista de espera viven en la app del medico. Rama aparte. _(2026-09-05, PR #43)_
- [ ] **`open_patient_encounter` siempre crea una consulta nueva** — no reutiliza una consulta abierta del mismo paciente, asi que un doble clic o volver a entrar deja consultas vacias en estado OPEN. Ahora es la entrada principal, no la secundaria. _(2026-10-05, paso 27)_
- [ ] **La receta no lleva nombre ni cedula del medico** — la app de escritorio no conoce esos datos (viven en la cuenta del portal y no bajan al equipo). La receta en Mexico los exige; encaja con la salida del expediente del paso 28. _(2026-10-05, paso 27)_
- [ ] **El mock del navegador (`ipc.ts`) tiene una sola consulta fija** — `open_patient_encounter` devuelve siempre la de Hugo, sin importar el paciente; estorba para verificar flujos en el navegador. _(2026-10-05, paso 27)_
- [ ] **CI en GitHub** — los PRs no reportan checks; hoy todo se verifica a mano en local. _(2026-10-05)_

## Trabajo abierto

- [ ] **PR #41, odontograma doble vista por diente** — abierto desde 2026-07-17, sin revisar. _(2026-10-05)_
- [ ] **Paso 22, diarizacion** — falta compilar nativo con `--features diarization-local`, prueba e2e con audio real, fijar los `MIDOC_DIARIZE_*_SHA256` y rehospedar los `.onnx` con sus licencias. _(2026-06-18)_

## Resueltos

- [x] **La cancelacion ARCO del desktop no limpiaba tablas agregadas despues** — fallaba por llave foranea si el paciente tenia transcripciones y dejaba linea del tiempo, ordenes de laboratorio, presupuestos dentales, contacto del responsable y liga al portal. Corregido 2026-10-07 en `v2/fix-arco-cancelacion` (el pendiente abierto que trae la rama del paso 28 r6 se cierra con este arreglo).
- [x] **3 pruebas de integracion del portal fallando en `dev`** (cola de notificaciones, DST de agenda publica, creditos de IA) — PR #42, 2026-10-05.
- [x] **Expediente clinico persistido en PostgreSQL** — PR #43, 2026-10-05.
