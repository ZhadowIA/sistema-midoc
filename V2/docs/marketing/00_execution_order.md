# 00 - Orden de ejecución de Marketing Skills

## Objetivo

Secuenciar el trabajo de marketing de MiDoc para construir primero fundamentos y después canales. La regla es simple: cimientos antes que campañas. Si hacemos ads antes de posicionamiento, analytics y onboarding, solo pagamos por descubrir errores básicos.

## Orden operativo

| Orden | Skill | Entregable | Motivo |
|---:|---|---|---|
| 1 | `product-marketing` | `.agents/product-marketing.md` | Base de ICP, categoría, diferenciación, tono y restricciones. |
| 2 | `customer-research` | `01_customer_research.md` | Objeciones, JTBD y lenguaje real del cliente. |
| 3 | `competitor-profiling` | Sección competitiva en `01_customer_research.md` | Comparar papel, Excel, WhatsApp, Doctoralia y cloud-first. |
| 4 | `site-architecture` | `02_site_architecture.md` | Mapa de páginas antes de escribir copy. |
| 5 | `copywriting` | `03_copy_pages.md` | Copy de landing y páginas críticas. |
| 6 | `copy-editing` | Revisión de `03_copy_pages.md` | Quitar exageraciones y mejorar claridad. |
| 7 | `seo-audit` | `04_seo_plan.md` | Keywords, metadatos, estructura SEO y riesgos. |
| 8 | `schema` | Sección schema en `04_seo_plan.md` | SoftwareApplication, Organization y FAQPage. |
| 9 | `content-strategy` | `05_content_strategy.md` | Clusters y calendario editorial. |
| 10 | `ai-seo` | Sección AI search en `05_content_strategy.md` | Preparar contenido para respuestas generativas sin claims clínicos. |
| 11 | `analytics` | `06_analytics_plan.md` | Eventos y KPIs sin PHI. |
| 12 | `cro` | `07_conversion_onboarding.md` | Conversión de landing/demo. |
| 13 | `signup` | `07_conversion_onboarding.md` | Registro médico y fricción inicial. |
| 14 | `onboarding` | `07_conversion_onboarding.md` | Activación hasta primera cita/consulta. |
| 15 | `launch` | `08_launch_plan.md` | Beta cerrada y apertura controlada. |
| 16 | `emails` | Secuencias en `08_launch_plan.md` | Invitación, seguimiento, feedback y reactivación. |
| 17 | `cold-email` | Outreach en `08_launch_plan.md` | Prospección manual de beta. |
| 18 | `public-relations` | PR local en `08_launch_plan.md` | Credibilidad cuando existan aprendizajes reales. |
| 19 | `ads` / `social` / `sms` | `09_future_channels.md` | Solo después de tracción, analytics y compliance. |

## Compuertas de avance

1. No pasar a copy si no existe `.agents/product-marketing.md`.
2. No pasar a ads si no existe plan de analytics y conversión básica.
3. No usar SMS marketing en salud sin consentimiento explícito y revisión legal.
4. No publicar claims clínicos sin evidencia verificable.
5. No usar testimonios, métricas o logotipos no confirmados.

## Definición de “listo para ejecutar campañas”

MiDoc puede probar canales pagados solo cuando:

- Landing principal publicada y revisada.
- Evento `demo_requested` instrumentado.
- Registro médico y onboarding inicial medibles.
- Mensaje local-first entendido por usuarios beta.
- Al menos 5 entrevistas o demos reales documentadas.
