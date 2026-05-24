# Cumplimiento clínico y operativo

## Implementado en software

- Grabación clínica con validación de contexto seguro (`HTTPS` o `localhost`) y estado de permisos de micrófono.
- Cierre automático de sesión tras 15 minutos de inactividad con renovación por actividad.
- Progreso asíncrono por `SSE` para generación de nota SOAP sin congelar la UI.
- Registro del doble consentimiento:
  - `BOOKING_PRIVACY_NOTICE` al agendar.
  - `VERBAL_RECORDING_CONFIRMATION` al iniciar grabación en consulta.
- Bloqueo de acceso para `SECRETARY` en endpoints de expediente clínico.
- Respaldo estructurado `JSONB` del contenido SOAP en `ClinicalNote.soapPayload`.
- Auditoría activa en base de datos para acciones clínicas y eventos sensibles.
- Seudonimización de identificadores directos antes de construir prompts para OpenAI.
- Respuestas API clínicas con encabezados `Cache-Control: no-store`.

## Requiere configuración operativa o contractual

- Hospedaje en AWS o GCP con certificación ISO 27001 y selección regional acorde a la estrategia comercial.
- Uso de bases de datos administradas (`RDS` o `Cloud SQL`) con cifrado en reposo y `PITR`.
- Red privada/VPC con base de datos sin acceso público.
- Contratos B2B, DPA, NDA y documentos de encargado/responsable del tratamiento.
- Avisos de privacidad del proveedor y espacio para el aviso propio de cada médico.
- Firma del DPA de OpenAI en la consola del proveedor.
- Política formal de retención mínima de 5 años conforme a NOM-004.
- Flujo de exportación completa del expediente en `PDF/XML` y validación legal del formato final.
- Descargos visibles y contractuales para posicionar la IA como herramienta de apoyo y no SaMD.

## Siguiente paso recomendado

- Aplicar la migración de Prisma y regenerar el cliente antes de desplegar.
- Validar en entorno `HTTPS` real con iPad/tablet el flujo de grabación, expiración de sesión y SSE.
- Revisar con asesor legal mexicano el texto exacto de consentimientos, avisos y contratos.
