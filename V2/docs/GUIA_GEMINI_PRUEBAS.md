# Guía: conectar Gemini a la pasarela de IA (solo pruebas, 2026-11-14)

> **Regla de oro: en este entorno solo entran datos inventados.** No hay empresa formalizada, ni contrato de tratamiento de datos, ni retención cero con Google. Ningún paciente real, audio real ni nota real pasa por aquí. Ver `18_plan_de_ventas.md` §10.

## 0. Qué vas a lograr

Que la app del médico use el escriba, las notas, las indicaciones y la anamnesis a través del portal (paso 30), con **Gemini 2.5 Flash real**, y que puedas medir el costo por consulta.

Así funciona el código hoy [R]:
- El portal llama a `generativelanguage.googleapis.com` con la cabecera `x-goog-api-key`. Es una clave de **Google AI Studio**, no de Vertex AI (`text-gateway-provider.ts:86`).
- Modelo por omisión: `gemini-2.5-flash` (`text-gateway-service.ts:56`).
- Cada uso descuenta créditos al médico. Si el proveedor falla, los devuelve.

## 1. Requisitos

- **Ser mayor de 18 años.** Los términos de la API de Gemini lo exigen ([V] [aistudio.google.com/docs/terms](https://aistudio.google.com/docs/terms)).
- Una cuenta de Google **propia del proyecto**, no la personal de todos los días. Ejemplo: `midoc.dev@…`.
- Tarjeta para prepagar **al menos US$10** de créditos.

## 2. Crear la clave y activar el plan de pago

**Por qué es obligatorio el plan de pago:** en el plan gratuito, Google usa lo que mandas para mejorar sus productos y puede revisarlo una persona. En el de pago **no lo usa para entrenar**, pero sí guarda prompts y respuestas "por un periodo limitado" para detectar abusos ([V] términos). Aunque sean datos inventados, acostúmbrate a trabajar solo con el plan de pago.

1. Entra a [aistudio.google.com](https://aistudio.google.com) con la cuenta del proyecto.
2. Ve a **API keys** y elige **Create API key**. Se crea un proyecto de Google Cloud; llámalo `midoc-pruebas`.
3. En la página de **Projects** (o de API keys), busca la columna **Billing Tier** y haz clic en **Set up billing**.
4. Crea la cuenta de facturación y **prepaga US$10**. El plan Prepago es el predeterminado.
5. Revisa que el proyecto diga **Tier 1 / Paid**, no "Free".
   - Si se queda en "Free", crea **una clave nueva** dentro del mismo proyecto. Es un problema conocido en los foros de Google ([discuss.ai.google.dev](https://discuss.ai.google.dev/t/billing-setup-complete-but-quota-tier-stuck-on-free-tier-multiple-projects-multiple-keys/130113.md)).
6. **Pon un tope de gasto:**
   - El prepago ya funciona como tope: al acabarse el saldo, la API deja de responder.
   - Además, en Google Cloud ve a **Facturación → Presupuestos y alertas**, crea un presupuesto de US$10 y una alerta al 50 %.
7. Guarda la clave **solo** en tu gestor de contraseñas. Nunca en el repositorio, en un chat ni en una captura de pantalla.

## 3. Configurar el portal

Agrega estas variables al archivo de entorno **local** del portal (`V2/consultorio-app`), el que no se sube al repositorio. Si después lo llevas al despliegue de pruebas, van en las variables de Vercel del entorno de pruebas, **nunca en producción**:

```env
AI_GATEWAY_PROVIDER=gemini
GEMINI_API_KEY=<tu clave>
AI_GATEWAY_MODELS=gemini-2.5-flash
AI_GATEWAY_BAA_APPROVED=true
```

> ⚠️ **Sobre `AI_GATEWAY_BAA_APPROVED=true`.** El validador del entorno (`env-schema.ts`) no deja arrancar con un proveedor real si esta bandera no está en `true`. La bandera significa "el contrato con el proveedor y la retención cero están verificados", y **hoy no es cierto**.
> - **Es aceptable** en tu entorno local o de pruebas, porque ahí solo hay datos inventados.
> - **No es aceptable** en producción.
>
> **Alternativa más limpia** (pendiente, no implementada): una bandera aparte, por ejemplo `AI_GATEWAY_SYNTHETIC_DATA_ONLY=true`, que habilite el proveedor solo fuera de producción. Así `BAA_APPROVED` sigue significando lo que dice. Si la quieres, se hace en una rama propia con sus pruebas.

Después:

```bash
npm run env:check
```

```bash
npm run dev
```

`env:check` debe pasar sin errores sobre `GEMINI_API_KEY` ni `AI_GATEWAY_BAA_APPROVED`.

## 4. Preparar al médico de prueba

1. Crea en el portal una cuenta de médico **ficticia** (nombre y cédula inventados).
2. Como administrador, **otórgale una licencia** de piloto con `POST /api/platform-admin/doctors/{doctorId}/license` y `{"source":"PILOT"}`. Eso le da **30 créditos de cortesía** (`COURTESY_CREDITS` en `credit-ledger.ts`).
3. En la app de escritorio, **vincula** el equipo a esa cuenta (activación).

## 5. Probar de punta a punta

1. Crea un paciente ficticio, por ejemplo "Paciente Prueba Uno".
2. Abre una consulta y usa el escriba con un **guion inventado**: escrito por ti, o grabado por ti y un compañero, con la transcripción **local** (Whisper).
3. Pide la nota SOAP y las indicaciones.
4. Comprueba que:
   - la nota aparece para revisar, y no se guarda sola;
   - el saldo de créditos baja (1 crédito por tarea, según `ai-credits.ts`);
   - si quitas temporalmente la clave, la app muestra el error de pasarela y **no cobra**.

Repite con 5–10 consultas de distinta longitud. Incluye una de odontología con dictado al odontograma.

## 6. Medir el costo real

1. En AI Studio, ve a **Dashboard → Usage** y anota los tokens y el gasto de esas consultas.
2. Divide entre el número de consultas y compara con la estimación del plan de ventas (§6.3): **≈ $0.15–0.19 MXN por nota**.
3. Si el costo real sale más del doble, avísame y recalculamos los precios de los créditos.

## 7. Al terminar

- Si no vas a seguir probando, **desactiva o borra la clave** en AI Studio.
- Vuelve a poner `AI_GATEWAY_PROVIDER=none` en tu entorno local.
- Anota los resultados de costo en `PENDIENTES.md` o en el plan de ventas.

## Lo que esta guía NO habilita

- Pacientes, audios o notas **reales**: eso requiere empresa formalizada, aviso de privacidad, contrato con el médico y retención cero o contrato de datos con Google.
- Transcripción en la nube (OpenAI o Deepgram): tiene sus propias banderas, y no se activa en esta guía.
- Llevarlo a producción.
