# 09 - Canales futuros: ads, social y SMS

**Skills utilizadas:** `ads`, `social`, `sms`

## Objetivo

Definir cuándo y cómo usar canales de escala sin quemar presupuesto ni dañar confianza. En MiDoc, los canales futuros deben esperar a que posicionamiento, analytics y onboarding estén razonablemente probados.

## Ads

**Estado:** Diferido.

### Condiciones antes de activar

- Landing publicada.
- Evento `demo_requested` instrumentado.
- Demo request rate medido.
- Onboarding básico validado.
- Objeciones principales respondidas en página.
- Presupuesto experimental separado y acotado.

### Primeras campañas recomendadas

| Campaña | Audiencia | Mensaje |
|---|---|---|
| Search: software consultorio médico | Médicos buscando solución | Agenda en línea + expediente local |
| Search: software dentistas | Dentistas | Agenda y expediente local para consultorio dental |
| Retargeting demo | Visitantes de privacidad/precios | Ver MiDoc en demo guiada |

### No hacer todavía

- Campañas masivas en Facebook sin segmentación clara.
- Claims clínicos.
- Urgencia falsa.
- Promesas de cumplimiento absoluto.

## Social

**Estado:** Educación y confianza, no viralidad vacía.

### Pilares

- Privacidad clínica explicada simple.
- Errores comunes al manejar agenda/expediente con herramientas sueltas.
- Historias anónimas de flujo operativo, sin PHI.
- Educación sobre local-first.
- Detrás de cámaras de producto y seguridad.

### Canales posibles

- LinkedIn para médicos, administradores y aliados.
- Facebook/Instagram solo si el contenido educativo demuestra tracción.
- YouTube corto para demos guiadas y explicaciones.

## SMS

**Estado:** Transaccional, no marketing agresivo.

### Uso permitido

- Confirmaciones de cita.
- Recordatorios.
- Enlaces a preconsulta.
- Avisos operativos con consentimiento.

### Uso no recomendado

- Promociones agresivas.
- Mensajes con información clínica sensible.
- Campañas sin consentimiento explícito.
- Automatizaciones que revelen estado de salud.

### Reglas

- Usar proveedor oficial como Twilio.
- Mantener mensajes neutrales.
- Usar enlaces cortos controlados.
- Respetar opt-out.
- No incluir diagnóstico, receta, motivo de consulta ni información clínica.

## Decisión central

Paid y SMS no son atajos. Son amplificadores. Si el mensaje, la medición y el onboarding no están sólidos, amplifican confusión.
