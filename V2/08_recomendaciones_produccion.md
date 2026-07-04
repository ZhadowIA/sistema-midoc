# 08 - Recomendaciones para produccion

## Contexto tecnico

MiDoc usa Next.js, TypeScript, Prisma, PostgreSQL, archivos clinicos, SMS, correo transaccional, pagos, IA y datos sensibles de salud. Por eso la recomendacion de produccion debe priorizar seguridad, respaldos, observabilidad, control de secretos y despliegues reproducibles.

## Recomendacion principal

| Componente | Recomendacion |
|---|---|
| Aplicacion web | Contenedor Docker de Next.js con salida standalone. |
| Hosting inicial | Azure App Service para contenedor o Azure Container Apps. |
| Base de datos | Azure Database for PostgreSQL Flexible Server. |
| Archivos clinicos | Azure Blob Storage con URLs temporales/SAS. |
| Secretos | Azure Key Vault o variables seguras del proveedor. |
| Correo | **Resend (decidido 2026-06-13).** Configurar SPF, DKIM y DMARC en dominio propio. |
| SMS | **Twilio (decidido 2026-06-13).** Mensajeria transaccional con enlaces cortos propios. |
| Observabilidad | Logs estructurados, alertas 5xx, latencia, pagos, SMS/email, IA y base de datos. |

Dominio web decidido: **midocapp.com.mx**. Para correo transaccional con Resend se recomienda verificar un subdominio dedicado, por ejemplo `mail.midocapp.com.mx` o `notificaciones.midocapp.com.mx`, y usar remitentes como `no-reply@mail.midocapp.com.mx` despues de configurar SPF, DKIM y DMARC.

## Opciones de despliegue

| Opcion | Cuando conviene | Ventajas | Riesgos |
|---|---|---|---|
| Azure App Service + PostgreSQL Flexible Server | Recomendado para MiDoc por datos sensibles, DB administrada y ruta empresarial. | Buen equilibrio entre control, cumplimiento, backups y operacion administrada. | Requiere configurar CI/CD, red, secretos y monitoreo con cuidado. |
| Vercel + PostgreSQL administrado externo | Conviene para prototipo rapido o demo comercial. | Experiencia muy simple para Next.js y despliegues rapidos. | Menos control operativo integrado para una app clinica con jobs, archivos, SMS, pagos y auditoria. |
| Docker en VPS | Conviene si el costo fijo es prioridad y hay experiencia DevOps. | Control total y menor costo mensual inicial. | Mayor carga operativa: backups, TLS, monitoreo, parches, seguridad y recuperacion ante fallas. |
| AWS ECS/App Runner + RDS/SES/S3 | Conviene si el equipo ya domina AWS. | Ecosistema fuerte para contenedores, base de datos, email y storage. | Curva operativa mayor si el equipo no usa AWS diariamente. |

## Recomendacion por etapa

| Etapa | Plataforma sugerida | Motivo |
|---|---|---|
| Demo academica o validacion temprana | Vercel + Neon/Supabase PostgreSQL | Rapido de publicar y facil de mostrar. |
| Piloto real con pacientes | Azure App Service o Container Apps + PostgreSQL Flexible Server + Blob Storage | Mejor postura para datos sensibles, respaldos y operacion controlada. |
| Produccion comercial | Azure con CI/CD, Key Vault, alertas, backups, restore probado y dominios propios para email/SMS | Reduce riesgo operativo y facilita crecimiento formal. |

## Requisitos antes de produccion

- Dominio propio configurado para app, correo y enlaces cortos.
- HTTPS obligatorio.
- Variables de entorno separadas por ambiente.
- Base de datos con backups automáticos y prueba de restore.
- Migraciones Prisma ejecutadas por pipeline controlado.
- Storage privado para documentos clinicos.
- Politica de retencion y auditoria activa.
- Proveedor de correo configurado con SPF, DKIM y DMARC.
- Proveedor SMS con plantillas transaccionales revisadas.
- Password reset con token de un solo uso, expiracion y rate limit.
- Alertas para errores 5xx, DB, pagos, SMS/email, trabajos IA y cola de notificaciones.

## Fuentes consultadas

- Next.js permite despliegue administrado o self-hosting en Node.js/Docker: https://nextjs.org/docs/app/guides/self-hosting
- Vercel documenta despliegue directo de Next.js: https://vercel.com/docs/concepts/next.js/overview
- Docker documenta contenedores para Next.js con standalone output: https://docs.docker.com/guides/nextjs/containerize/
- Azure App Service soporta apps Node.js y despliegues administrados: https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs
- Azure Database for PostgreSQL Flexible Server es una base PostgreSQL administrada: https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview
- Resend ofrece SDK/API para correo transaccional en Node.js (proveedor de correo decidido): https://www.resend.com/
- Twilio ofrece SMS transaccional con enlaces cortos y plantillas (proveedor de SMS decidido): https://www.twilio.com/docs/messaging
- Amazon SES permite email transaccional mediante API/SMTP (alternativa de respaldo): https://docs.aws.amazon.com/ses/latest/dg/send-email.html
