# MiDoc - Tabla Maestra de Vistas y Flujos

> Documento de referencia para Claude Design.  
> Objetivo: describir cada vista con flujo, secciones, layout y componentes UI para mejorar el rediseño.

## Convenciones

- **Flujo principal**: recorrido del usuario dentro de la vista.
- **Secciones clave**: bloques de contenido que debe contener la vista.
- **Layout recomendado**: disposición visual sugerida.
- **Componentes UI principales**: elementos interactivos y visuales esperados.
- **Prioridad**: importancia relativa para rediseño.
- **Estado actual**: nivel de madurez o necesidad de mejora.

## Tabla maestra

| Vista | Usuario | Flujo principal | Secciones clave | Layout recomendado | Componentes UI principales | Prioridad | Estado actual |
|---|---|---|---|---|---|---|---|
| `/` Home / Landing | Visitante | Entra → entiende propuesta → navega a registro/agenda | Hero, value props, features, testimonios, CTA, footer | Navbar sticky + hero full-width + grid de cards + CTA final | Botones, cards, badges, FAQ accordion, footer links | Alta | Base inicial / por rediseñar |
| `/agendar` Agendar | Paciente / invitado | Elige doctor → fecha → hora → confirma → paga si aplica | Selector doctor, calendario, slots, resumen, confirmación | Wizard / 2 columnas en desktop / vertical en mobile | Calendar picker, slot buttons, summary card, inputs, CTA | Alta | Funcional / necesita mejor UI |
| `/confirmacion` Confirmación | Paciente | Reserva terminada → ve éxito → siguiente acción | Estado exitoso, resumen, próximos pasos, acciones | Vista centrada tipo success screen | Icono éxito, botones, número cita, resumen | Media | Debe pulirse |
| `/doctor/[slug]` Perfil doctor | Paciente | Ve perfil → revisa credenciales → agenda | Header doctor, info profesional, disponibilidad, CTA | Hero + 2 columnas | Avatar, badges, cards, botones | Alta | Debe diseñarse mejor |
| `/cuestionario/[token]` Cuestionario | Paciente | Abre enlace → responde → usa voz/texto → envía | Contexto, progreso, preguntas, IA voz/texto, envío | Wizard step-by-step | Progress bar, inputs, textarea, micrófono, botones next/prev | Alta | Debe estructurarse mejor |
| `/privacidad` Privacidad | Usuario legal | Consulta política → encuentra secciones → lee | Resumen, bloques legales, contacto, fecha | Documento largo con sidebar índice | Headings, enlaces ancla, callouts, accordion opcional | Media | Básico |
| `/terminos` Términos | Usuario legal | Consulta términos → navega cláusulas → cierra | Resumen, cláusulas, limitaciones, contacto | Documento largo con sidebar índice | Headings, accordion opcional, links legales | Media | Básico |
| `/medico/login` Login médico | Médico | Inicia sesión → entra al panel | Formulario, valor, ayuda | Split layout en desktop / card centrada en mobile | Inputs email/password, botón login, links auxiliares | Alta | Funcional pero mejorable |
| `/medico/registro` Registro médico | Médico | Crea cuenta → acepta legal → sigue setup | Formulario, consentimiento, validación | Wizard corto o formulario segmentado | Inputs, checkbox legal, CTA, links | Alta | Funcional pero mejorable |
| `/medico/suscripcion` Suscripción | Médico | Compara planes → elige → contrata | Planes, comparativa, FAQ, facturación | Grid 3 cards + tabla comparativa + FAQ | Pricing cards, toggle mensual/anual, badges, botones | Alta | Debe diseñarse |
| `/medico/onboarding` Onboarding | Médico | Especialidad → horarios → clínica → foto/firma → finaliza | Stepper, especialidad, horarios, clínica, perfil | Wizard multi-step con progreso visible | Stepper, selects, inputs, uploads, botones next/prev | Alta | Muy importante |
| `/medico/dashboard` Dashboard médico | Médico | Entra → ve resumen → actúa rápido | KPI widgets, citas hoy, pacientes, alertas, quick actions | Sidebar colapsable + header sticky + grid de widgets | Stat cards, search, notificaciones, action buttons | Muy alta | Funcional pero dispersa |
| `/medico/agenda` Agenda médica | Médico | Revisa día/semana → manipula citas | Calendario, filtros, listado, detalle rápido | Calendar amplio + panel lateral | Calendar grid, chips estado, menus de acción, filtros | Alta | Necesita mejor visual |
| `/medico/citas/[id]` Detalle cita | Médico | Abre cita → revisa paciente → accede a acciones | Resumen, paciente, timeline, acciones, contexto | Detalle con sidebar / panel lateral | Badges, timeline, cards, tabs, botones | Muy alta | Importante |
| `/medico/citas/[id]/consulta` Consulta | Médico | Documenta consulta → usa IA → guarda | Editor clínico, SOAP, IA, antecedentes, acciones | Workspace de 2–3 columnas | Textareas, tabs SOAP, botón guardar, panel IA | Muy alta | Debe ser pro |
| `/medico/citas/[id]/consulta-v2` Consulta v2 | Médico | Misma consulta, más modular y avanzada | Workspace, insights, acciones, avance | Layout modular tipo workspace pro | Tabs, accordion, cards, shortcuts | Alta | Variante avanzada |
| `/medico/citas/[id]/encuentro` Encuentro clínico | Médico | Revisa encuentro → documenta → cierra atención | Contexto, síntomas, evolución, cierre | Formulario amplio con secciones colapsables | Accordions, inputs, textareas, chips | Alta | Debe ordenarse |
| `/medico/citas/[id]/receta` Receta | Médico | Revisa medicamentos → valida → firma/guarda | Medicamentos, validación, resumen, exportación | Panel principal + alertas laterales | Inputs, selects, alert badges, botones acción | Alta | Muy importante |
| `/medico/pacientes` Pacientes | Médico | Busca → filtra → entra al detalle | Search, filtros, tabla/listado, acciones | Tabla en desktop + cards en mobile | Search, table, filters, action menu, CTA nuevo paciente | Alta | Funcional pero simple |
| `/medico/pacientes/[id]` Detalle paciente | Médico | Abre paciente → revisa datos → accede a historia | Header, datos, historial, notas, acciones | Detalle con tabs o sidebar | Avatar, badges, timeline, cards, botones | Muy alta | Importante |
| `/medico/pacientes/[id]/historia-clinica` Historia clínica | Médico | Revisa expediente longitudinal → versiones → evolución | Timeline, versiones, resumen, eventos | Timeline vertical / cards cronológicas | Timeline, cards expandibles, selector versión | Muy alta | Muy importante |
| `/medico/expedientes/encounters/[id]` Exp. encounter | Médico | Revisa encounter → payload especialidad → detalles | Resumen, historial, payload, notas | Detalle con secciones apiladas | Accordion, cards resumen, tabs, export | Alta | Debe diseñarse |
| `/medico/cuestionarios` Cuestionarios | Médico | Revisa respuestas → filtra → abre detalle | Listado, filtros, estado, detalle | Tabla + panel detalle | Search, filters, badges, rows, buttons | Media-alta | Básico |
| `/medico/configuracion` Configuración | Médico | Ajusta perfil → horarios → clínica → seguridad | Tabs de config, formularios por bloque | Tabs horizontales o sidebar tabs | Inputs, selects, switches, uploads, save button | Alta | Muy importante |
| `/medico/contabilidad` Contabilidad | Médico | Ve ingresos → analiza → exporta | KPIs, gráficas, tabla, filtros | Stats arriba + charts + tabla | Stat cards, date picker, charts, table, export | Media-alta | Funcional / mejorar visual |
| `/medico/caja` Caja | Médico / recepción | Registra cobros → revisa caja → cierra | Estado caja, movimientos, resumen, cierre | Cards + lista + acción de cierre | Buttons, totals, tables, modal confirmación | Media | Operativa |
| `/medico/recepcion` Recepción | Recepción / médico | Ve agenda día → hace check-in → gestiona cola | Lista del día, estados, filtros, acciones | Panel principal + sidebar de cola | Table/list, chips, buttons, filters | Alta | Operativa |
| `/medico/recursos` Recursos | Médico / admin | Revisa recursos → asigna → controla estado | Inventario, estado, asignaciones, alertas | Grid/lista + panel detalle lateral | Search, filters, cards, toggles, buttons | Media | Debe diseñarse |
| `/medico/ia-gobernanza` IA gobernanza | Médico / admin | Revisa métricas IA → audita → exporta | KPIs, charts, heatmap, tabla, filtros | Stats row + charts + tabla final | Date range picker, filter chips, charts, export, table | Muy alta | Importante |
| `/paciente/login` Login paciente | Paciente | Inicia sesión → entra a historial/consultas | Formulario, ayuda | Card centrada o split minimalista | Inputs, botón login, links recuperación | Media | Básico |
| `/paciente/historial` Historial paciente | Paciente | Ve citas pasadas → abre detalle → descarga | Timeline, documentos, resumen, descargas | Cards o timeline + panel detalle | Cards, timeline, buttons descarga, badges | Alta | Básico |
| `/paciente/consultas` Consultas paciente | Paciente | Ve consultas activas/pasadas → abre detalle | Próximas consultas, historial, acciones | Lista principal + detalle opcional | Cards, chips de estado, botones | Media | Básico |
| `/paciente/pre-checkin` Pre-check-in | Paciente | Completa datos → responde → envía | Preguntas, progreso, contexto, envío | Wizard step-by-step mobile-first | Inputs, radios, checkboxes, progress, CTA | Alta | Muy importante |
| `/paciente/cuenta` Cuenta paciente | Paciente | Revisa datos → cambia info → gestiona preferencias | Perfil, seguridad, preferencias, consentimientos | Tabs o cards por bloque | Inputs, switches, avatar upload, save button | Media | Básico |

## Recomendación de orden para Claude Design

1. Landing
2. Pricing / Suscripción
3. Dashboard médico
4. Onboarding
5. Agendar
6. Consulta médica
7. Paciente / pre-check-in
8. Configuración
9. Historia clínica
10. IA Gobernanza
11. Historial paciente
12. Estados legales y errores

## Clasificación por tipo de experiencia

### Conversión
- Landing
- Pricing / Suscripción
- Agendar
- Login
- Registro

### Operación clínica
- Dashboard médico
- Agenda
- Detalle de cita
- Consulta
- Encuentro
- Receta
- Pacientes
- Historia clínica

### Autoservicio paciente
- Historial
- Consultas
- Pre-check-in
- Cuenta

### Control y análisis
- IA Gobernanza
- Contabilidad
- Caja
- Recepción
- Recursos

### Legal
- Privacidad
- Términos

## Nota final para Claude Design

No diseñar todas las vistas con la misma densidad visual.  
Las vistas de conversión deben priorizar claridad y CTA.  
Las vistas clínicas deben priorizar productividad, jerarquía y escaneo rápido.  
Las vistas analíticas deben priorizar densidad controlada y lectura de datos.

