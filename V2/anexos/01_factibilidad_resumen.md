# Anexo 01 - Estudio de factibilidad resumido

## Factibilidad tecnica

MiDoc V2 es tecnicamente factible porque el sistema actual ya cuenta con base en Next.js, Prisma, PostgreSQL, autenticacion, roles, agenda, expediente, documentos clinicos, carga externa de estudios, notas clinicas, portal de paciente, SMS, acortador de links, pagos e IA. La V2 no parte de cero; reorganiza y prioriza capacidades existentes alrededor del paquete integrado de atencion clinica.

## Factibilidad operativa

Es operativamente factible porque los usuarios principales ya estan identificados: medico y paciente. El flujo integrado reduce friccion, evita duplicidad y permite que el medico trabaje desde una sola vista de atencion.

## Factibilidad economica

Es economicamente razonable porque aprovecha infraestructura y conocimiento existente. La inversion principal estaria en rediseño funcional, experiencia de usuario, consolidacion de flujos, pruebas y endurecimiento de seguridad.

## Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Repetir separacion entre agenda y expediente | Alto | Mantener RF09 como requisito rector. |
| Dependencia excesiva de IA | Medio | Permitir captura manual siempre. |
| Exceso de alcance en V2 inicial | Alto | Priorizar atencion clinica integrada antes de analitica o teleconsulta. |
| Manejo sensible de datos clinicos | Alto | Aplicar roles, auditoria, consentimiento y retencion. |
| Carga insegura de documentos | Alto | Usar enlaces temporales, permisos, validacion de archivos y auditoria. |
| SMS catalogados como spam por URLs largas | Medio | Usar enlaces cortos propios, consistentes y con expiracion cuando aplique. |

## Conclusion

La V2 es factible si se implementa de forma incremental, comenzando por el paquete integrado agenda-expediente y dejando funciones avanzadas como IA, pagos complejos y crecimiento comercial para fases posteriores.
