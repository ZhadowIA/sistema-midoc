# 18 - Plan de ventas de MiDoc (propuesta, 2026-11-14)

> **Estado: PROPUESTA para revisión.** No sustituye a `15_modelo_de_negocio.md`; lo aterriza. El modelo (compra única + créditos de IA) se da por decidido. Todo precio aquí es una **apuesta inicial para aprender**, no un precio optimizado.
>
> **Revisado el 2026-11-14 contra la pila de 46 PRs sin integrar** (punta: `v2/paso22-sobreagrupar`). Este documento se escribió primero sobre `dev`, que estaba atrasado. Lo que cambió al revisar la pila:
> 1. **Ya existe una propuesta de precios aceptada el 2026-10-19** (`15_modelo_de_negocio.md` §5). Este plan la toma como base (§6) y solo propone ajustes, cada uno con su razón.
> 2. **Whisper local en CPU tarda 8 veces la duración del audio**: una consulta de 13 min tardó 1 h 43 min. Hoy la transcripción local **no es viable** en equipos sin GPU, así que el argumento de "transcripción local gratis" **no se puede vender todavía** (§6.4).
> 3. **La preconsulta se descongeló** (paso 32, decisión del 2026-10-18): cuestionario cifrado por enlace o QR. Es un diferenciador nuevo.
> 4. **La seguridad farmacológica está apagada** tras un interruptor hasta consultar a COFEPRIS (software como dispositivo médico). **No se puede anunciar** como función.
> 5. **Base de medicamentos** (paso 33): receta con denominación genérica y clave CNIS. Es otro diferenciador, pero sus catálogos de marcas y reglas están vacíos.
> 6. **La app nunca se ha probado con médicos reales.**
>
> Convención de fuentes: **[V]** = verificado en la fuente con URL y fecha de consulta (2026-11-14 salvo que se diga otra); **[E]** = estimación propia, con el cálculo a la vista; **[R]** = dato del repositorio.

---

## 1. Resumen ejecutivo

1. **Qué vendemos:** una app de escritorio de expediente clínico (medicina general y odontología) que **es del médico**: funciona sin internet, guarda todo cifrado en su equipo y trae IA (escriba, anamnesis, dictado dental) que se paga **solo cuando se usa**.
2. **Precio:** se mantiene la propuesta aceptada el 2026-10-19, con tres ajustes (§6.2).
   - **Licencia: $5,990 MXN con IVA**, con 2 equipos y 12 meses de actualizaciones. Renovación de **$1,490 al año**.
   - **Créditos:** ~$2.50 cada uno en recargas que no caducan ($290 por 100 y $1,190 por 500). Plan mensual de **$449 con 250 créditos**.
   - **Ajustes propuestos:**
     - licencia Fundador a $3,990 para los primeros 100;
     - más créditos de cortesía;
     - un **Plan Pro** de mayor volumen;
     - nuevo cobro de la transcripción en la nube.
3. **Contra quién competimos:** la competencia mexicana cobra **$259–$1,199 MXN al mes**, para siempre. A 24 meses (§6.4):
   - El médico que **usa poca IA** paga con nosotros **mucho menos** (~$7.5 mil frente a $14–33 mil).
   - El que **usa IA a diario** paga **algo menos** que la opción con IA más cara (Astramedik Pro) y mucho menos que un escriba internacional.
   - Contra el más barato (SaludTotal, ~$4.4 mil) **no ganamos por precio**.
4. **La verdad incómoda:** no tenemos **certificado DGIS NOM-024**, ni agenda, ni facturación CFDI al paciente, ni acceso desde el celular. Varios competidores sí. Además, **la IA en la nube aún no está validada en staging con proveedor real y BAA** (paso 30). Por eso **no vendemos "software de consultorio"**. Vendemos **"tu expediente, tuyo, privado y con IA"** a un perfil concreto (§4).
5. **Bloqueos antes de cobrar el primer peso** (§10):
   - revisión fiscal/PROFECO con contador;
   - pasarela de pago y CFDI;
   - validar el paso 30 en staging;
   - firma de código del instalador;
   - modo de prueba y referidos (no existen aún);
   - **cobrar los créditos por consulta** (§6.2–6.4): con el catálogo de hoy, la IA en la nube cuesta más del doble que la competencia;
   - **consulta regulatoria con COFEPRIS** (software como dispositivo médico);
   - **prueba con médicos reales**;
   - **Whisper local viable** en equipos sin GPU.

---

## 2. Qué es MiDoc hoy (para no vender humo)

| Tema | Estado | Fuente |
|---|---|---|
| Expediente longitudinal, SOAP, plantillas, CIE-10, receta con requisitos legales, odontograma/periodontograma | Implementado | [R] `14_…`, `PENDIENTES.md` |
| Transcripción **local** (Whisper) y diarización | Funcionan de punta a punta con audio real, pero **no están listas para distribuir**: 8 veces la duración del audio en CPU (Ryzen 5 sin GPU) y separación de hablantes pobre en una demo de 20 min. PRs #118–#123 sin fusionar | [R] pila: `PENDIENTES.md`, `10_…` paso 22 |
| Escriba, anamnesis asistida, dictado dental | En la línea de desarrollo (pasos 21–26). **No verifiqué el estado de cada uno** | [R] |
| **Preconsulta configurable** (enlace general, QR o enlace personal; respuestas cifradas para la llave del médico) | Cuatro rebanadas entregadas (paso 32, PRs #112–#117 sin fusionar); falta recorrer la ventana real de la app | [R] pila: `16_preconsulta_configurable.md` |
| **Base de medicamentos**: CNIS, doble denominación en la receta, marcas | Diseño cerrado y etapas en PRs (#103–#110). **Catálogo de marcas y reglas de contraindicación vacíos** (requieren médico piloto y farmacéutico) | [R] pila: `17_base_medicamentos.md` |
| Avisos al médico, bloqueo por inactividad, consultas abiertas, órdenes de laboratorio dental | Implementados en la pila | [R] |
| Portal de pruebas | Arriba en `midoc-pruebas.vercel.app`; **falta probarlo de punta a punta** | [R] |
| **Pruebas con médicos reales** | **Nunca se han hecho** (pendiente del 2026-11-08) | [R] |
| Pasarela de IA en la nube (paso 30) | **🚧 Código listo; falta validar en staging con proveedor real y BAA.** Hoy no se pueden vender créditos de nube | [R] `10_…:1438` |
| Modo de prueba de 14 días y créditos por referido | **No existen**: requieren desarrollo | [R] búsqueda en `src/` |
| macOS | **Sin verificar**; asumir solo Windows | – |
| Seguridad de medicación determinista (interacciones, alergias, duplicidad) | Implementada, pero **apagada tras un interruptor** hasta la consulta regulatoria con COFEPRIS | [R] pila: `PENDIENTES.md` |
| Exportación PDF / FHIR (narrativa) / CSV | Implementado; FHIR aún sin codificar odontograma/antecedentes | [R] `PENDIENTES.md` |
| Licencia firmada offline, activación, libro de créditos | Implementado (paso 29); **2 equipos por omisión** (`DEFAULT_MAX_DEVICES = 2`) | [R] `license-service.ts` |
| Pasarela IA: Gemini 2.5 Flash / GPT-5-mini (texto), Deepgram Nova-3 o gpt-4o-mini-transcribe (audio) | Implementado (paso 30) | [R] `text-gateway-service.ts`, `env-schema.ts` |
| **Certificación DGIS NOM-024** | **No.** HL7 CDA "no entra salvo que se busque certificar" | [R] `10_…:1374` |
| **Cobro, CFDI, revisión PROFECO** | **Pendiente** | [R] `PENDIENTES.md:12` |
| Agenda, portal del paciente, caja, recordatorios | Congelados tras bandera (la preconsulta salió de esta lista el 2026-10-18) | [R] `14_…` §3 y §7 |

---

## 3. Mercado

| Dato | Valor | Fuente |
|---|---|---|
| Consultorios médicos (unidades económicas) | **85,908** (DENUE, corte mayo 2026) | [V] [economia.gob.mx/…/6211](https://www.economia.gob.mx/es/profile/industry/6211) |
| Consultorios dentales | **76,188** (DENUE, corte mayo 2026) | Fragmento de búsqueda **no verificado** en la página; [economia.gob.mx/…/6212](https://www.economia.gob.mx/es/profile/industry/6212) |
| Tipo de cambio de referencia | **~18.6 MXN/USD** (promedio 10-nov-2026) | [V] [eldolar.info](https://www.eldolar.info/es-MX/mexico/dia/20261110) |

**Cuidado al leer esto:** DENUE cuenta *establecimientos*, no médicos. Incluye consultorios de farmacia y quizás algunos públicos (la ficha no lo distingue). Úsalo como orden de magnitud: **~160 mil consultorios**. Si capturamos el **0.5 %** (~800 licencias) en 24 meses, ya es un negocio viable para un equipo pequeño (§9).

---

## 4. Cliente ideal (a quién SÍ y a quién NO)

### Sí: los tres perfiles prioritarios

1. **Dentista independiente o con 1–2 sillones (prioridad 1).** Odontograma, periodontograma, plan de tratamiento y dictado dental por IA ya están. La competencia dental en México **no publica precios** y vende SaaS caro ([hackceleration, 2026](https://hackceleration.com/es/labs/mejor/software-gestion-clinica-dental); Dentalink "desde US$29" y Dentidesk "desde US$50" según Capterra, [V] sin confirmar periodicidad ni precio en MXN). Pagar una vez es un mensaje fuerte para ellos.
2. **Médico general o familiar con consulta privada propia**, 8–20 pacientes al día, que hoy usa Word, papel o un sistema que le parece caro. Le duele **escribir la nota**, no agendar.
3. **Especialista preocupado por la privacidad** (psiquiatría, ginecología, urología), para quien "los datos de mis pacientes no salen de mi computadora" vale más que una agenda en línea.

### No (por ahora)

- **Clínicas y hospitales que exigen NOM-024/DGIS** o integración con aseguradoras. Perdemos la venta; no la forcemos.
- **El médico cuyo problema es la agenda y los cobros.** Esos módulos están congelados. Recomiéndale honestamente otra herramienta o usa el caso para medir demanda de reactivación (§8).
- **El médico que solo trabaja desde el celular o en varias sedes sin laptop.**

---

## 5. Competencia y diferenciación

### 5.1 Precios de la competencia en México

Fuente principal: la comparativa de SaludTotal, actualizada el 25-oct-2026 ([V] [saludtotal.mx](https://saludtotal.mx/es/blog/mejores-sistemas-expediente-clinico-mexico-comparativa/)). **Es el blog de un competidor**, así que hay sesgo posible. Solo verifiqué directamente la página de Astramedik.

| Producto | Precio/mes (MXN) | IVA | NOM-024 DGIS | IA de notas |
|---|---|---|---|---|
| SaludTotal | $259 ($183 con pago anual, $2,199/año) | no especifica | Sí (a jul-2028) | Transcripción como plan adicional |
| Mi-Consultorio | $299 | incluido | En trámite | Dictado |
| Luna Salud | $400 (3 usuarios) | no especifica | No | Sí, con cuotas |
| MediSel | $450 | + IVA | Sí | SOAP y CIE-10 |
| Eleonor | $499 | incluido | Sí | Dictado y asistente |
| HuliPractice | $590 | + IVA | Sí | Notas IA |
| DAR | Gratis / $599 Premium | incluido | Sí | No menciona |
| **Astramedik** | **$699 Básico / $1,199 Profesional** | + IVA | No verificado | Dictado + diagnóstico IA (solo Profesional), **sin límite publicado** ([V] [astramedik.com](https://www.astramedik.com/)) |
| Doctoralia Practice + Noa Notes | $720 (anual, promoción) | + IVA | No | Noa Notes. Precio en MX **no encontrado**; en España ~30 €/mes ([pabau.com](https://pabau.com/es/blog/precios-de-doctoralia-pro/), [E] no extrapolable) |
| Nimbo-X | No publica | – | Sí | Nimbo Scribe, 30 interacciones/mes |

**Escribas de IA internacionales** (USD, mercado EE. UU., cifras de blogs que no coinciden entre sí): Freed **$39–$119/mes** (Starter con tope de 40 notas), Heidi con plan gratis y **~$110–150/mes**, Nabla **~$119/mes** ([voiceboxmd](https://voiceboxmd.com/ai-medical-scribe/pricing/), [patientsquare](https://patientsquare.com/us/blog/best-ai-medical-scribes/), [veroscribe](https://www.veroscribe.com/blog/best-ai-medical-scribe)). A 18.6 MXN/USD equivalen a **$725–$2,800 MXN/mes**, **solo por la IA** y con los datos en la nube del proveedor.

**Software de pago único y de escritorio también existe**, sobre todo en el sector dental:
- Dentáctil se describe como "software en propiedad" de pago único.
- XDental y Dendoo ofrecen pago único como una modalidad más, con versión de escritorio.
- Fuente: fichas de [softwaredoit.es](https://www.softwaredoit.es/xdental/xdental.html), orientadas a España; **no confirmé que se vendan en México**.

Dentis365, nuestra referencia de paridad dental (paso 26), **no publica precios** en lo que encontré.

### 5.2 En qué SÍ somos distintos (defendible)

| Diferenciador | Por qué importa al médico | Quién más lo tiene |
|---|---|---|
| **Compra única: el programa es tuyo** | Deja de pagar renta; si MiDoc desaparece, su app sigue funcionando | Nadie de la tabla mexicana. Existe en software dental de escritorio tradicional, **sin IA** que yo haya encontrado |
| **Local-first y cifrado en su equipo** | El médico es responsable de los datos personales de sus pacientes; aquí no salen de su PC. Sin internet sigue consultando | Nadie de la tabla (todos son nube); sí los dentales de escritorio |
| **IA que se paga por uso** | Quien ve 5 pacientes no subsidia a quien ve 30. *(La "transcripción local gratis" solo será argumento cuando Whisper sea rápido en equipos comunes, §6.4.)* | Nadie que haya encontrado: todos cobran la IA dentro de la mensualidad o con tope |
| **Preconsulta cifrada por QR o enlace** | El paciente llena sus antecedentes y su motivo de consulta desde el celular antes de llegar; la nube nunca ve las respuestas | Varios SaaS tienen precheckin, pero en la nube y legible por el proveedor |
| **Receta con denominación genérica y clave CNIS** junto a la marca | Receta clara para farmacia y paciente | No verificado en la competencia. **Anunciar solo cuando el catálogo esté lleno y revisado** |
| **Medicina general + odontología en un solo producto**, con IA dental (dictado al odontograma) | El dentista no tiene que adaptarse a un software "médico" | No encontré software dental con IA de dictado en México. **Sin investigar a fondo**: verificar antes de afirmarlo en publicidad |
| ~~Seguridad de medicación determinista~~ | **No anunciar**: está apagada hasta la consulta con COFEPRIS | – |
| **IA con revisión humana obligatoria y seudonimización** | El médico firma lo que entiende; el proveedor de IA no ve identificadores | Comunicación débil en la competencia |

### 5.3 En qué perdemos (decirlo antes de que lo diga el cliente)

| Desventaja | Impacto | Respuesta de ventas |
|---|---|---|
| **Sin certificado DGIS NOM-024** | Alto con clínicas e instituciones. Con el consultorio independiente **no está claro**: proveedores certificados dicen que sin NOM-024 el expediente electrónico pierde validez, y otras fuentes lo ven opcional ([Medesk](https://www.medesk.net/es/blog/expediente-clinico-electronico-vs-papel-mexico/), [norma en el DOF](https://dof.gob.mx/normasOficiales/4956/SALUD1/SALUD1.html)) | Hoy, la línea de desarrollo **deja la NOM-024 fuera** salvo que se decida certificar. Respuesta honesta: "No estamos certificados ante la DGIS." **No afirmar cumplimiento normativo** sin dictamen de un abogado (§10). Decisión abierta (§11). |
| Sin agenda, recordatorios ni cobro | Alto para quien busca "todo en uno" | Posicionarnos como **expediente + IA + preconsulta**: "úsalo junto a tu agenda de Google o Doctoralia" |
| Transcripción local lenta en equipos sin GPU | **Alto**: sin ella, la IA depende de la nube y cuesta más | Hasta resolverlo, vender la IA con transcripción en la nube y precios realistas (§6.4) |
| Sin facturación CFDI al paciente | Medio | Integración futura con un PAC (§8) |
| Solo escritorio, sin acceso móvil | Medio | Dos equipos incluidos (consultorio + casa) |
| Marca nueva, sin casos de éxito | Alto al principio | Programa fundador con testimonios (§7) |

---

## 6. Precios propuestos

### 6.1 Principios (de la skill `pricing`, adaptados a compra única)

- **Valor, no costo:** el ancla es "lo que pagarías en 12–24 meses de suscripción", no lo que nos cuesta producir una copia (≈ 0).
- **No caer en la trampa del precio ultrabajo:** atrae curiosos y es muy difícil subirlo después. Mejor un precio redondo, un poco alto, con descuento fundador **explícito y temporal**.
- **Métrica de valor de la IA = consultas documentadas.** El médico no piensa en créditos sino en consultas: toda comunicación debe traducir créditos a consultas.

### 6.2 Tabla de precios (IVA incluido)

**Base:** la propuesta aceptada el 2026-10-19 (`15_modelo_de_negocio.md` §5). La columna "Ajuste" indica qué propone este plan.

| Concepto | Precio | Ajuste | Qué incluye |
|---|---|---|---|
| **Licencia MiDoc** | **$5,990** | = aceptado | App completa para siempre, medicina general + odontología, **2 equipos**, 12 meses de actualizaciones, parches críticos 3 años (§6.5) |
| Licencia **Fundador** (primeros 100, o hasta una fecha fija) | **$3,990** | **nuevo** | Lo mismo + **24 meses** de actualizaciones. A cambio: testimonio y llamada de retroalimentación |
| Renovación de actualizaciones | **$1,490/año** | = aceptado | 12 meses más de versiones nuevas. Si no renueva, conserva la última versión recibida |
| Equipo adicional | **$990 único** | **nuevo** | Tercer equipo en adelante |
| Recarga 100 créditos | **$290** ($2.90) | = aceptado | No caducan |
| Recarga 500 créditos | **$1,190** ($2.38) | = aceptado | No caducan |
| **Plan mensual** | **$449/mes por 250 créditos** ($1.80) | = aceptado | ≈ 125 consultas asistidas |
| **Plan Pro mensual** | **$990/mes por 700 créditos** ($1.41) | **nuevo** | ≈ 350 consultas asistidas, para quien ve 15+ pacientes al día |
| Créditos de cortesía | **100** | **subir** (el código tiene 30, `COURTESY_CREDITS`) | ≈ 50 consultas asistidas: 2–3 semanas de uso real. Con 30 (≈ 15 consultas) no se crea el hábito |

**Ajuste clave: cobrar por consulta, no por tarea.** Hoy `ai-credits.ts` cobra cada tarea por separado (transcripción por bloques, nota, indicaciones). El médico no puede predecir cuánto le cuesta una consulta, y la transcripción en la nube puede dejar pérdida (§6.3). Propuesta:

| Uso | Créditos |
|---|---|
| **Consulta asistida en la nube**: transcripción estándar hasta 30 min + nota SOAP + indicaciones | **2** |
| La misma, con separación médico/paciente | **3** |
| Cada 30 min adicionales de audio | +1 |
| Tarea de solo texto (resumen longitudinal, brechas) | 1–2, como hoy |
| Consulta con transcripción local | **1** (solo el texto) |

El mensaje al médico queda simple: **"un crédito ≈ media consulta"**.

### 6.3 Costo unitario de la IA y margen

Precios oficiales consultados el 2026-11-14:
- Gemini 2.5 Flash: $0.30/M tokens de entrada de texto, $2.50/M de salida, incluido el razonamiento ([V] [aistudio.google.com/docs/pricing](https://aistudio.google.com/docs/pricing)).
- Deepgram Nova-3 multilingüe pregrabado: **$0.0052/min, con diarización incluida** ([V] [deepgram.com/pricing](https://deepgram.com/pricing)).

- OpenAI: gpt-5-mini a $0.25/M de entrada y $2.00/M de salida; gpt-4o-mini-transcribe a ~$0.003/min; gpt-4o-transcribe a ~$0.006/min ([V] [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing)). **No encontré el precio de `gpt-4o-transcribe-diarize`**: lo supongo igual al de gpt-4o-transcribe [E].
- El proveedor de transcripción **se elige por despliegue** (`deepgram` u OpenAI, en `app/api/sync/ai/transcriptions/route.ts`) [R], así que calculo ambos.

Los tokens por tarea son estimaciones [E]. El ingreso por crédito más bajo es el del Plan Pro propuesto: $1.41 → **$1.22 sin IVA**.

**Costo nuestro por consulta de 20 min** (MXN @18.6):

| Consulta | Costo | Créditos propuestos | Costo por crédito | ¿Margen a $1.22? |
|---|---|---|---|---|
| Solo texto (nota + indicaciones) | ≈ $0.34 | 1 | $0.34 | ✅ ~72 % |
| Nube estándar con **OpenAI mini** ($0.003/min) | 1.12 + 0.34 ≈ **$1.46** | 2 | $0.73 | ✅ ~40 % |
| Nube estándar con **Deepgram** ($0.0052/min) | 1.93 + 0.34 ≈ **$2.27** | 2 | $1.14 | ⚠️ ~7 % |
| Nube con separación de hablantes, Deepgram (incluida) | ≈ $2.27 | 3 | $0.76 | ✅ ~38 % |
| Nube con separación, OpenAI (precio supuesto, ~$0.006/min) | ≈ $2.57 | 3 | $0.86 | ✅ ~30 % |

**Medición real (2026-11-14)** [V]: 5 consultas inventadas (general y dental) pasaron por la pasarela (`runGatewayGeneration`) con Gemini 2.5 Flash de pago.
- **Costo:** **≈ $0.19 MXN por consulta** sumando nota SOAP e indicaciones, dentro de la estimación.
- **Tokens:**
  - el **razonamiento** se lleva el 84 % de los tokens de salida (16,893 de 20,086);
  - la entrada pesó poco: unas 450 fichas por llamada, porque los textos de prueba eran cortos. Una transcripción real de 20 min tendrá varios miles de fichas de entrada, que suman poco a $0.30 por millón.
- **Tiempo:** de 5 a 13 segundos por llamada.
- **Calidad:** los 5 borradores SOAP salieron como JSON válido. Se cobró 1 crédito por llamada y no se cobró nada cuando la pasarela estaba apagada.
- **Con el razonamiento limitado** (mismas 5 consultas, `thinkingBudget` inyectado solo en la prueba):

  | Razonamiento | MXN por consulta | Tiempo por llamada | JSON válido |
  |---|---|---|---|
  | Sin límite (actual) | ≈ 0.19 | 5–13 s | 5/5 |
  | 512 fichas | ≈ 0.07 | 3–5 s | 5/5 |
  | Apagado (0) | ≈ 0.03 | 1–2.5 s | 5/5 |

  Con el razonamiento apagado, las indicaciones se apegaron más al plan (no inventaron cuidados de pies), pero en un caso agregaron una nota de relleno sobre los diagnósticos previos. Con 512 fichas convirtieron síntomas de la consulta en "datos de alarma". Falta que un médico compare la calidad antes de elegir.

**Acciones requeridas** (no se implementan en este documento):
1. **Transcripción estándar en la nube solo con `gpt-4o-mini-transcribe`.** Deepgram, solo para la separación de hablantes, donde no cobra extra.
2. **Catálogo de créditos por consulta** (§6.2), en lugar de por tarea.
3. **Hacer viable la transcripción local** en equipos sin GPU: es lo que más margen y precio puede dar (§6.4).

Otro riesgo: `preconsulta-ai.ts` usa `claude-opus-4-8` como modelo por omisión para Anthropic. Si algún flujo activo lo usa, su costo por crédito es **mucho mayor** y hay que recalcularlo.
- Comisión de la pasarela: [E] en México, del orden de 3–4 % + cuota fija + IVA (**verificar con el proveedor elegido**). En la recarga mínima de $349, eso da ≈ $15–17 por cobro, aceptable. **No ofrecer recargas menores a ~$300.**

### 6.4 Pruebas de cordura de los precios

**Costo total a 24 meses, con IVA** [E]. MiDoc = licencia $5,990 + una renovación de $1,490 + IA.

Supuestos [E]:
- **Transcripción en la nube**, porque la local hoy no es viable.
- **22 días al mes.**
- MiDoc = licencia $5,990 + una renovación de $1,490 + IA.
- Competencia: mensualidad × 24, +16 % de IVA donde no lo incluye.

| Perfil | Con el catálogo de hoy (4 créditos/consulta) y precios aceptados | **Con los ajustes** (2 créditos/consulta + Plan Pro) | Competencia |
|---|---|---|---|
| **Sin IA** | $7,480 | $7,480 | SaludTotal anual $4,398 · MediSel $12,528 · HuliPractice $16,426 |
| **IA moderada** (8 consultas/día = 176/mes) | 704 créditos ≈ $1,529/mes → **$44,180** | 352 créditos = Plan $449 + recarga de 100 → $739/mes → **$25,216** | HuliPractice $16,426 · Astramedik Básico $19,460 (sin dictado) |
| **IA intensa** (15/día = 330/mes) | 1,320 créditos ≈ $2,996/mes → **$79,380** | 660 créditos = Plan Pro $990 → **$31,240** | Astramedik Pro $33,380 · Freed (~US$99/mes) ≈ $44,000, solo IA |

**Lectura honesta:**
- **Con el catálogo y los precios de hoy, la IA en la nube no es competitiva**: el médico intenso pagaría más del doble que con Astramedik Pro. Es el hallazgo más importante de esta revisión.
- **Con los ajustes:**
  - el médico intenso queda un poco por debajo de Astramedik Pro;
  - el moderado queda **más caro** que HuliPractice o Astramedik Básico, que traen una IA más limitada. Ahí ganamos solo por calidad de la nota, privacidad y propiedad;
  - el médico sin IA ahorra mucho frente a casi todos.
- **Cuando la transcripción local sea viable**, la consulta asistida cuesta 1 crédito en lugar de 2. El médico moderado bajaría a ~$18,000, y ahí sí ganamos en todos los perfiles.

| Otra prueba | Resultado |
|---|---|
| Recarga mínima frente a la comisión | $290 → ≈ $13–15 de comisión [E]. ✅ |
| Costo de 100 créditos de cortesía | 100 × ≤ $0.86 = **≤ $86** por licencia. ✅ |
| Margen del Plan Pro, todo en la nube estándar (OpenAI mini) | 700 × $0.73 = $511 de costo frente a $853 netos: ~40 %, antes de comisión. ✅ |

### 6.5 Respuestas a lo pendiente del doc 15 §5

| Pregunta | Opción A | Opción B | Opción C | Recomendación |
|---|---|---|---|---|
| **Precio de licencia** | $3,990 | **$5,990 (aceptado el 2026-10-19)** | $8,990 | **Mantener B**, con Fundador a $3,990 |
| **Renovación** | 20 % ($1,190) | **25 % ($1,490, aceptado)** | Solo versiones mayores de pago | **Mantener B** |
| **Equipos por licencia** | 1: más ventas extra, más fricción | **2 (ya es el valor por omisión)** | 3 | **B** + $990 por equipo adicional |
| **Periodo de parches críticos** | 2 años | **3 años desde la compra** | Mientras exista la versión mayor | **B**: acotado, comunicable y suficiente para la NOM |
| **Equivalencia de créditos** | Mantener `ai-credits.ts` (por tarea) | **Por consulta: 2 en la nube, 3 con separación de hablantes, 1 local** | Créditos por token | **B**: predecible para el médico y competitivo (§6.4) |

---

## 7. Plan comercial (go-to-market)

### 7.1 Mensaje central

> **"Tu expediente es tuyo. Cómpralo una vez, trabaja sin internet, y deja que la IA escriba la nota mientras tú atiendes al paciente."**

Mensajes por perfil:
- **Dentista:** "Dicta el odontograma en voz alta y termina la nota antes de que el paciente se levante del sillón."
- **Médico general:** "Cero mensualidades. La nota SOAP se arma sola a partir de la conversación; tú solo revisas y firmas."
- **Especialista sensible:** "Los datos de tus pacientes nunca salen de tu computadora."

### 7.2 Fases

| Fase | Fechas [E] | Meta | Acciones |
|---|---|---|---|
| **0. Preparar** | Nov–Dic 2026 | Poder cobrar legalmente | Bloqueos del §10; página de precios; instalador firmado; video demo de 3 min por perfil |
| **1. Fundadores** | Ene–Mar 2027 | **100 licencias fundador**, 30 testimonios, medir uso real de créditos | Venta directa 1 a 1 (demo por videollamada de 20 min); grupos de médicos y dentistas en Facebook/WhatsApp; colegios locales; red personal |
| **2. Lanzamiento** | Abr–Jun 2027 | 300 licencias acumuladas | Precio normal; webinars mensuales "IA en la consulta sin violar la privacidad"; stand en 1–2 congresos dentales; programa de referidos |
| **3. Escala** | Jul 2027 → | 800 licencias a 24 meses | Distribuidores dentales (venden insumos al mismo cliente) con comisión; convenios con universidades (licencia para recién egresados); contenido en YouTube/TikTok de casos reales |

### 7.3 Canales, del más barato al más caro

1. **Referidos:** quien recomienda y su referido reciben **100 créditos** cada uno. Cuesta poco (§6.4) y aprovecha que los médicos confían en sus colegas.
2. **Contenido:** demos cortas de "nota en 30 segundos", comparaciones honestas y guías de la NOM-004.
3. **Comunidades:** colegios médicos y dentales estatales, grupos de residentes y egresados.
4. **Congresos:** congresos dentales nacionales y regionales, y de medicina familiar. Demo en vivo con dictado. *(Los nombres y fechas concretos están por investigar.)*
5. **Distribuidores dentales:** comisión del 15–20 % sobre la licencia.
6. **Pauta digital:** Meta/Google, solo hasta que la conversión sea medible.

### 7.4 Embudo y métricas (supuestos [E] a validar en la fase 1)

| Paso | Tasa supuesta |
|---|---|
| Visita a la página → descarga de prueba | 5 % |
| Prueba de **14 días** (con créditos de prueba) → compra | 15–20 % |
| Demo 1 a 1 → compra | 25–35 % |

**Métricas que importan:**
- % de licencias que compran créditos al mes 3 (meta ≥ 40 %).
- Créditos por médico activo al mes.
- Tasa de renovación de actualizaciones (meta ≥ 50 %).
- Costo de IA ÷ ingreso por créditos (meta ≤ 35 %).

> **Prueba gratis:** recomendamos una prueba de 14 días con todo habilitado y 40 créditos. El médico **debe** ver la IA en acción antes de pagar $5,990.

### 7.5 Manejo de objeciones

| Objeción | Respuesta |
|---|---|
| "¿Y si se me descompone la computadora?" | Respaldo cifrado y restauración incluidos; 2 equipos. *(Ver respaldo en la nube cifrado en §8.)* |
| "¿Tiene NOM-024?" | "No estamos certificados ante la DGIS." Lo que sí se puede decir: la receta lleva los datos del médico que pide la ley (implementado). Para afirmar cumplimiento de la NOM-004, hace falta dictamen legal. Si una institución exige la certificación, hoy no somos la opción. |
| "Ya pago Doctoralia" | MiDoc no compite con la agenda: úsalos juntos; MiDoc es tu expediente y tu escriba. |
| "Los créditos me suenan a que me van a cobrar de más" | Un crédito es media consulta y lo sabes antes de usarla; las recargas no caducan; si no usas IA, no pagas nada más. |
| "¿Y si MiDoc cierra?" | La app sigue funcionando para siempre sin conexión; tus datos se exportan a PDF, FHIR y CSV. |

---

## 8. Otras herramientas que mejorarían la experiencia del médico

Leyenda: **A** = dentro del alcance activo; **C** = reactivar un módulo congelado; **N** = nuevo. Todas se revisaron contra la regla de **nunca guardar contenido clínico en la nube**.

| # | Herramienta | Tipo | Valor para el médico | Riesgo de residencia |
|---|---|---|---|---|
| 1 | **Respaldo automático cifrado** a USB / Google Drive / OneDrive del propio médico | N | Elimina la objeción número uno de lo local | ✅ Solo si se sube **texto ya cifrado** con una llave que nunca sale del equipo |
| 2 | **Receta con folio y QR de verificación** (la farmacia valida que es auténtica) | N | Confianza y antifalsificación | ⚠️ La nube guarda solo hash + cédula + fecha, **nunca** medicamentos ni paciente |
| 3 | **Firma electrónica con e.firma (FIEL) del SAT** en nota y receta | N | Valor legal y paso hacia NOM-024 | ✅ Firma local |
| 4 | **Importar resultados de laboratorio en PDF** con extracción local a valores estructurados y gráficas de tendencia | A/N | Ahorra captura; el copiloto longitudinal (paso 31) gana datos | ✅ Si el OCR es local; ⚠️ si va a la pasarela, seudonimizado y con consentimiento |
| 5 | **Visor de radiografías y fotos clínicas** (periapicales, intraorales) anotadas en el odontograma | N | Muy valorado por dentistas | ✅ Local |
| 6 | **App compañera del celular solo por red local** (tomar foto clínica → al expediente) | N | Fotos sin cables y sin nube | ✅ Si la conexión es LAN directa y cifrada |
| 7 | **Facturación CFDI vía un PAC externo** (solo datos fiscales) | C/N | Elimina la segunda herramienta más pedida | ✅ Los datos fiscales no son contenido clínico; **no** enviar diagnóstico en el concepto |
| 8 | **Agenda local simple** (reactivar paso 20 como complemento de pago) | C | Responde a "le falta agenda" | ✅ Local |
| 9 | **Recordatorios al paciente** (reactivar paso 7) | C | Menos inasistencias. Combina con la preconsulta del paso 32 (el recordatorio lleva el enlace del cuestionario) | ⚠️ Solo nombre, hora y consultorio, nunca motivo de consulta |
| 10 | **Folletos de indicaciones** personalizados e impresos para el paciente (ya existe la generación de indicaciones) | A | Mejor adherencia; se ve profesional | ✅ |
| 11 | **Certificados médicos, incapacidades y constancias** con plantilla | A | Uso diario, muy pedido | ✅ |
| 12 | **Certificación DGIS NOM-024** (HL7 CDA, auditoría) | N | Abre clínicas e instituciones | ✅ Es un proyecto grande |

**Cómo priorizarlas:** con los médicos fundadores, preguntando "¿cuál de estas pagarías?" (MaxDiff simple). Sugerencia inicial: **1, 11, 10, 2** primero (baratas, quitan objeciones); **7 y 8** solo si la fase 1 muestra que perdemos ventas por ellas.

---

## 9. Proyección ilustrativa [E]

Escenario base a 24 meses: **800 licencias** (100 fundador + 700 normal).

| Fuente | Cálculo | Con IVA | **Neto (sin IVA)** |
|---|---|---|---|
| Licencias | 100 × $3,990 + 700 × $5,990 | $4.59 M | **$3.96 M** |
| Renovaciones | Los fundadores tienen 24 meses, así que no renuevan en esta ventana. Solo son elegibles ~250 licencias normales vendidas en los meses 4–12; renueva el 50 %: 125 × $1,490 | $0.19 M | **$0.16 M** |
| Créditos | 40 % de 800 activos × $650/mes promedio × ~12 meses efectivos | $2.50 M | **$2.15 M** |
| **Total 24 meses** | | ≈ $7.3 M | **≈ $6.3 M MXN** |

A esto hay que restar el costo de IA (≤ 35 % de los créditos), las comisiones, el soporte y la operación.

Esto es **ilustrativo, no un pronóstico**: las tasas reales salen de la fase 1. **Riesgo principal:** que pocos médicos adopten la IA. En ese caso el ingreso sería casi solo de licencias, como ya advierte el doc 15 §4.

---

## 10. Bloqueos antes de vender (lista de verificación)

- [ ] Revisión fiscal y PROFECO con contador: CFDI por cobro, créditos como ingreso diferido, recargas sin caducidad (ya en `PENDIENTES.md`).
- [ ] Elegir pasarela de pago y PAC de CFDI; confirmar comisiones reales.
- [ ] Ajustar el costo de la transcripción en nube (§6.3) y confirmar qué modelo usa cada flujo activo.
- [ ] Validar el paso 30 en staging con proveedor real y BAA; sin eso no hay créditos de nube que vender.
- [ ] Desarrollar el modo de prueba (14 días + 40 créditos) y los créditos por referido.
- [ ] Dictamen legal: ¿la NOM-024/DGIS es obligatoria para que el expediente electrónico de un consultorio privado tenga validez? ¿Qué podemos afirmar sobre la NOM-004?
- [ ] Firma de código del instalador de Windows (evita la alerta de SmartScreen que espanta al médico).
- [ ] Aviso de privacidad, términos de licencia (alcance de "para siempre", 2 equipos, periodo de parches) y consentimiento de IA revisados por un abogado.
- [ ] Página de precios que traduzca créditos a consultas, y calculadora "¿cuánto pagaría al mes?".
- [ ] Whisper local viable en equipos sin GPU (modelo más chico, VAD, compilación optimizada) y requisitos mínimos de hardware publicados. Hoy: 8 veces la duración del audio en CPU.
- [ ] Consulta regulatoria con COFEPRIS o un especialista: software como dispositivo médico, seguridad farmacológica y asistentes de IA (ya en `PENDIENTES.md` de la pila).
- [ ] Prueba de usabilidad con 3–5 médicos (general y dentista), ya en `PENDIENTES.md` de la pila. Sin ella no conviene la fase de fundadores.
- [ ] Regenerar el certificado de firma de staging, comprometido desde que estuvo público en el repositorio (ya en `PENDIENTES.md` de la pila).
- [ ] Integrar en `dev` la pila de 46 PRs (#78–#123) para vender desde una base estable.

## 11. Decisiones que necesito de ti

1. ¿Se aprueba **cobrar por consulta** (2 créditos en la nube, 3 con separación de hablantes, 1 local) en lugar de por tarea?
2. ¿Agregamos el **Plan Pro ($990 / 700 créditos)**, la **licencia Fundador ($3,990)** y **100 créditos de cortesía**?
3. ¿La transcripción estándar en la nube va solo con OpenAI mini?
4. ¿Arrancamos por **dentistas** como segmento prioritario?
5. ¿Vamos o no por la **certificación DGIS NOM-024** en 2027?
6. ¿Qué herramientas del §8 entran a la línea de desarrollo?

---

## Anexo A. Skills instaladas para este trabajo

| Skill | Origen | Cómo se verificó | Cómo quitarla |
|---|---|---|---|
| `pricing` (v2.1.7) | [github.com/coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills), commit `1f83744`, licencia MIT (confirmada en la API de GitHub), descargada el 2026-11-14 | Ver abajo | Borrar `~/.claude/skills/pricing` |
| `launch` | Mismo repositorio y commit | Ver abajo | Borrar `~/.claude/skills/launch` |

**Cómo se verificaron:**
- Solo se copiaron archivos Markdown: sin scripts, ejecutables ni evals.
- Se leyeron completos los dos `SKILL.md`. De los seis archivos de referencia se revisaron los encabezados y se buscaron comandos de shell, instrucciones del tipo "ignora/ejecuta/instala" y peticiones de claves.
- Lo único ejecutable que apareció es un `git log` de ejemplo en `launch/references/shipped-changes.md`, que es de solo lectura. También hay menciones a herramientas asociadas, que se ignoraron.
- **No fue una auditoría línea por línea de las referencias.**

**Qué se usó:**
- De `pricing`: valor frente a costo, ancla, la advertencia contra precios ultrabajos y MaxDiff/Van Westendorp para la fase 1.
- De `launch`: sus cinco fases (interna → alfa → beta → acceso anticipado → completa) inspiran las fases del §7.2. Se comprimieron en cuatro, con venta directa como fase beta pagada.
- Su orientación a suscripciones SaaS **no** se aplicó, porque el modelo ya está decidido.

## Anexo B. Fuentes

- SaludTotal, comparativa de ECE en México (actualizada el 25-oct-2026): https://saludtotal.mx/es/blog/mejores-sistemas-expediente-clinico-mexico-comparativa/
- Astramedik, precios: https://www.astramedik.com/
- Precios de Gemini API: https://aistudio.google.com/docs/pricing
- Precios de Deepgram: https://deepgram.com/pricing
- Precios de OpenAI: https://developers.openai.com/api/docs/pricing
- NOM-024 (DOF): https://dof.gob.mx/normasOficiales/4956/SALUD1/SALUD1.html ; Medesk sobre su validez: https://www.medesk.net/es/blog/expediente-clinico-electronico-vs-papel-mexico/
- Software de pago único (fichas, España): https://www.softwaredoit.es/xdental/xdental.html , https://www.softwaredoit.es/dentactil/dentactil.html
- DENUE vía Secretaría de Economía: https://www.economia.gob.mx/es/profile/industry/6211 y …/6212
- Tipo de cambio: https://www.eldolar.info/es-MX/mexico/dia/20261110
- Escribas de IA: https://voiceboxmd.com/ai-medical-scribe/pricing/ , https://patientsquare.com/us/blog/best-ai-medical-scribes/ , https://www.veroscribe.com/blog/best-ai-medical-scribe
- Doctoralia Noa (España): https://pabau.com/es/blog/precios-de-doctoralia-pro/
- Software dental: https://hackceleration.com/es/labs/mejor/software-gestion-clinica-dental , https://www.capterra.com/p/196361/Dentalink/
