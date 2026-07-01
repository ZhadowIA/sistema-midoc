# 02 - Arquitectura del sitio público

**Skill utilizada:** `site-architecture`

## Objetivo

Diseñar una estructura web clara para explicar MiDoc, resolver objeciones críticas y convertir visitantes en solicitudes de demo. El sitio debe enseñar la arquitectura local-first sin convertirla en clase técnica pesada.

## Navegación principal

- Producto
- Especialidades
- Privacidad
- Precios
- Recursos
- Solicitar demo

## Sitemap inicial

| URL | Objetivo | Audiencia | CTA principal | Objeción que resuelve | Skill secundaria |
|---|---|---|---|---|---|
| `/` | Explicar MiDoc en 5 segundos y llevar a demo | Médicos y dentistas | Solicitar demo | “¿Qué es y por qué me importa?” | `copywriting` |
| `/medicos-generales` | Mostrar caso de uso para consulta general/familiar | Médicos generales | Solicitar demo | “¿Sirve para mi consulta diaria?” | `copywriting` |
| `/dentistas` | Mostrar flujo dental y seguimiento | Dentistas | Solicitar demo | “¿Tiene sentido para odontología?” | `copywriting` |
| `/agenda-medica` | Posicionar agenda pública + sync | Médicos que buscan agenda online | Ver cómo funciona | “¿Esto reemplaza mi agenda actual?” | `seo-audit` |
| `/expediente-clinico-local` | Explicar local-first y cifrado | Médicos preocupados por privacidad | Conocer privacidad | “¿Dónde viven mis datos?” | `schema` |
| `/privacidad` | Dar confianza sin exagerar cumplimiento | Decisor técnico/legal | Solicitar demo | “¿Qué guardan en la nube?” | `copy-editing` |
| `/precios` | Presentar paquetes cuando existan | Comprador | Solicitar demo | “¿Cuánto cuesta?” | `pricing` |
| `/demo` | Capturar intención | Prospecto caliente | Enviar solicitud | “Quiero verlo sin compromiso” | `cro` |
| `/recursos` | Hub de educación | Tráfico orgánico | Leer guía / demo | “Necesito aprender antes de comprar” | `content-strategy` |
| `/recursos/expediente-clinico-digital` | Captar búsquedas informativas | Médico investigando | Leer guía / demo | “¿Qué debe tener un expediente digital?” | `seo-audit` |
| `/recursos/agenda-medica-en-linea` | Captar búsquedas de agenda | Médico con dolor operativo | Ver agenda médica | “¿Cómo modernizo citas?” | `seo-audit` |
| `/recursos/software-para-dentistas` | Captar segmento dental | Dentistas | Ver MiDoc Dental | “¿Qué software necesito?” | `seo-audit` |

## Estructura de homepage

1. Hero: promesa clara + CTA.
2. Problema: agenda, expediente y consulta fragmentados.
3. Solución: portal público + app local cifrada.
4. Cómo funciona: paciente agenda → médico sincroniza → atiende localmente.
5. Diferenciador local-first.
6. Casos por especialidad.
7. IA asistida con revisión humana.
8. Seguridad y privacidad.
9. CTA demo.

## Reglas de arquitectura

- La página de privacidad debe estar a un clic desde el hero.
- Cada página de especialidad debe enlazar a `/expediente-clinico-local`.
- Cada recurso educativo debe enlazar a una página comercial relacionada.
- No crear páginas de especialidades fuera de medicina general/familiar y odontología en la fase inicial.
