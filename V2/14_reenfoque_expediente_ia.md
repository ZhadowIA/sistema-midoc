# 14 - Reenfoque de producto: expediente + apoyo IA (2026-09-07)

Este documento fija el cambio de alcance decidido el 2026-09-07 y manda sobre cualquier alcance previo descrito en `01_contexto_v2.md`, `05_requerimientos_funcionales.md`, `07_capacidades_heredadas_y_alcance.md` y `10_linea_de_desarrollo.md`. Los pasos ya cerrados no se reescriben: se reclasifican.

## 1. Decisión

MiDoc V2 se convierte en **una aplicación de expediente clínico con apoyo de IA para el médico**. Todo lo que no ayude directamente a documentar y resolver la consulta del paciente sale del alcance activo: agenda, portal del paciente, recepción, lista de espera, caja y cobro de consulta, notificaciones al paciente.

El objetivo es profundidad, no amplitud: que el expediente y la asistencia de IA queden mejor que los de cualquier competidor, en lugar de tener diez módulos correctos a medias.

### Qué cambia en la frase de producto

| Antes | Ahora |
|---|---|
| Plataforma SaaS de consultorio: agenda, paciente, consulta, cobro y seguimiento. | App de escritorio para el médico: expediente clínico local cifrado con asistencia de IA durante y después de la consulta. |
| La cita abre el contexto del paciente. | **El paciente abre el contexto**; la consulta nace del expediente, no de una cita. |
| La nube coordina paciente y médico. | La nube solo sostiene la cuenta, la suscripción y la pasarela de IA. |

## 2. Alcance activo

### 2.1 Núcleo clínico (app del médico)

- Directorio de pacientes y expediente longitudinal con línea del tiempo.
- Antecedentes y ficha del paciente (personales, patológicos, familiares, alergias, medicación).
- Encuentro clínico: nota SOAP, plantillas por perfil clínico, exploración, diagnóstico y plan.
- Perfil medicina familiar/general y perfil odontología (odontograma, periodontograma, índice de placa, plan de tratamiento dental).
- Receta e indicaciones, con cierre, firma y versionado de nota.
- Documentos clínicos locales adjuntos al expediente.
- Base SQLite cifrada, multi-perfil por equipo, respaldo y restauración.
- Privacidad y derechos ARCO con residencia local.

### 2.2 Apoyo IA (app del médico + pasarela del portal)

- Transcripción local (Whisper) y diarización médico/paciente.
- Escriba de consulta: la conversación se acomoda en segmentos revisables de la plantilla activa.
- Anamnesis asistida: antecedentes propuestos desde la conversación, reconciliados campo por campo.
- Dictado al odontograma, nota de evolución dental e indicaciones post-operatorias.
- Seguridad de medicación determinista (interacciones, alergias cruzadas, duplicidad) — sin IA, con fuente citada.
- Gobernanza: consentimiento, seudonimización, trazas, revisión humana obligatoria, créditos y degradación explícita de proveedor.

### 2.3 Portal nube reducido

Se conserva únicamente:

- Cuenta del médico: registro, login, recuperación, 2FA, aceptación legal.
- Suscripción y planes, con gating por capacidad.
- **Pasarela de IA**: las llamadas a proveedores salen por el portal, que custodia claves y contratos (BAA), aplica cuotas y registra el uso por referencia. Nunca ve contenido clínico identificable.

Todo lo demás del portal queda apagado (§3).

## 3. Fuera de alcance: congelado tras bandera

Decisión: **no se borra código, se apaga**. Cada módulo fuera de alcance queda detrás de una bandera de capacidad apagada por omisión; desaparece de la navegación y de las rutas, y deja de mantenerse. Se documenta aquí para poder reactivarlo sin arqueología.

| Módulo | Dónde vive | Paso de origen | Estado |
|---|---|---|---|
| Agenda pública con hold y reserva del paciente | Portal | 3 | Congelado |
| Portal del paciente e historial autorizado | Portal | 6 | Congelado |
| Precheckin y buzón temporal cifrado de documentos | Portal + escritorio | 6, 19 | Congelado |
| Notificaciones SMS/correo al paciente y enlaces cortos | Portal | 7 | Congelado |
| Perfil público, servicios y disponibilidad publicada | Portal | 2 | Congelado |
| Agendado con responsable/tutor | Portal | 18 | Congelado |
| Agenda día/semana del médico | Escritorio | 20 | Congelado |
| Recepción y lista de espera | Escritorio | 10 | Congelado |
| Caja diaria, cobros y recibos | Escritorio | 10 | Congelado |
| Saldos por avance del presupuesto dental | Escritorio | 26 | Congelado (el plan de tratamiento clínico se conserva) |
| Sincronización de citas y disponibilidad escritorio ↔ portal | Ambas | 0, 6, 19 | Congelado (sobrevive el enlace de cuenta y la pasarela de IA) |

Nada de esto se elimina de la base de datos local ni de PostgreSQL en este reenfoque: apagar es reversible, migrar destructivamente no. La limpieza de esquema se evalúa solo si un módulo se declara muerto de forma definitiva.

**Excepción explícita:** el retiro del expediente clínico persistido en la nube (rama `v2/retirar-expediente-nube`) sí es destructivo y se mantiene, porque corrige una violación de residencia de datos, no un cambio de alcance.

## 4. Consecuencias que el reenfoque obliga a resolver

1. **Punto de entrada.** Hoy la app abre en Agenda. Con la agenda apagada, la app debe abrir en **Pacientes**. El camino ya existe: `open_patient_encounter` inicia una consulta desde el directorio sin cita previa.
2. **Alta de paciente.** Sin portal del paciente ni precheckin, el paciente se crea y se edita únicamente en la app. La resolución de duplicados (paso 13, rebanada 3) pasa a ser el único filtro.
3. **Consulta sin cita.** Existe hoy dentro de Recepción (`register_walk_in`). Al congelar Recepción, esa capacidad debe vivir en el expediente, no perderse.
4. **Documentos del paciente.** Sin buzón, los estudios entran por adjunto local. El expediente necesita una entrada de archivos decente (arrastrar y soltar, previsualización, vinculación al encuentro).
5. **Pasarela de IA sin agenda.** El reporte de uso de IA hacia el portal ya viaja por referencia y no depende de citas; el enlace de cuenta debe seguir vivo aunque la sincronización de agenda se apague.
6. **Suscripción sin agenda.** El gating por capacidad debe reexpresarse en términos de expediente e IA (por ejemplo, minutos de transcripción o consultas asistidas), no de citas.

## 5. Decisiones pendientes

| Tema | Pregunta abierta |
|---|---|
| Órdenes de laboratorio dental (paso 26) | Es coordinación clínica, no cobro. ¿Se conserva activa o se congela junto con la operación del consultorio? |
| Notificaciones al propio médico | ¿Sobrevive algún aviso (respaldo fallido, suscripción por vencer) por correo, o la app no notifica nada hacia afuera? |
| Exportación del expediente | ¿Qué formato exige el médico para entregar o migrar un expediente (PDF por consulta, expediente completo, CSV)? |
| Modelo de negocio | **Decidido 2026-10-06:** compra única + créditos de IA, sin suscripción obligatoria. Ver `15_modelo_de_negocio.md`. |

## 6. Cómo se refleja en la línea de desarrollo

`10_linea_de_desarrollo.md` conserva los pasos 0-26 como historia y agrega la tabla de reclasificación (vigente / congelado) más los pasos nuevos 27 en adelante, que son los que llevan el producto a su nueva forma. Ningún paso cerrado se reabre para borrar código: se apaga y se sigue.
