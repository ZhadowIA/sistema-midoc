# Runbook — Caída de proveedor IA

Estado: Vigente  
Última actualización: 2026-04-29

## Cuándo usarlo

- fallos repetidos de generación IA
- degradación masiva de transcripción, insights o validación clínica
- aumento anómalo de errores por proveedor/modelo

## Objetivo

Mantener la operación clínica sin bloquear consulta médica por dependencia externa.

## Pasos

1. Confirmar módulo afectado:
   - dictado
   - insights
   - cuestionario IA
   - validación de receta
2. Revisar:
   - tasa de error
   - proveedor/modelo
   - ventana temporal
3. Activar fallback operativo:
   - comunicar indisponibilidad de IA
   - mantener flujo manual
4. Si el problema es costo o looping:
   - pausar temporalmente el uso afectado si aplica
5. Confirmar que la UI no quede colgada esperando IA
6. Registrar incidente si afecta operación real

## No hacer

- no prometer respuesta IA si el proveedor sigue inestable
- no dejar a usuario atrapado en loading indefinido
