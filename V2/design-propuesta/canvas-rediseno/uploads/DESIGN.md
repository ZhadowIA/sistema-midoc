# Design

Sistema visual de MiDoc V2 (portal nube y, por herencia, app de escritorio). Mood: "consultorio al mediodia — bata limpia, instrumental ordenado, tinta cobalto sobre blanco". Registro: product. Estrategia de color: Restrained.

## Color (OKLCH)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `oklch(1 0 0)` | Fondo del documento. Blanco puro, sin tinte. |
| `--surface` | `oklch(0.974 0.004 250)` | Paneles, sidebar, zonas agrupadas. |
| `--ink` | `oklch(0.24 0.022 250)` | Texto principal (≈13:1 sobre bg). |
| `--muted` | `oklch(0.49 0.02 250)` | Texto secundario (≥4.6:1 sobre bg). |
| `--line` | `oklch(0.9 0.008 250)` | Bordes y divisores. |
| `--primary` | `oklch(0.49 0.143 250)` | Acciones primarias, seleccion, links, focus. Texto blanco encima. |
| `--primary-hover` | `oklch(0.43 0.143 250)` | Hover de primarias. |
| `--primary-soft` | `oklch(0.95 0.025 250)` | Fondos de seleccion/estado activo suaves. |
| `--accent` | `oklch(0.58 0.105 195)` | Segundo color (verde-azulado): badges informativos, estados "confirmado". |
| `--success` | `oklch(0.55 0.12 155)` | Exito. |
| `--warning` | `oklch(0.66 0.13 70)` | Advertencia. |
| `--danger` | `oklch(0.51 0.17 25)` | Error/destructivo. |
| `--danger-soft` | `oklch(0.96 0.02 25)` | Fondo de mensajes de error. |

Reglas: texto blanco sobre cualquier relleno saturado de luminancia media; el cobalto nunca se usa como decoracion de fondo grande; semanticos solo para estado.

## Typography

- **Familia unica:** Public Sans (next/font/google), fallback system-ui. Pesos 400 / 500 / 600 / 700.
- **Escala fija en rem, ratio 1.2:** 0.8 / 0.92 / 1 / 1.2 / 1.44 / 1.72 / 2.07rem. Sin clamp en UI de producto.
- Base 16px; jerarquia por peso + tamaño; sin mayusculas en texto corrido; `text-wrap: balance` en h1-h3.

## Shape & Space

- Radios: 6px controles, 10px tarjetas/paneles, 999px solo pills/avatares. Nunca >16px.
- Bordes 1px `--line`; sombras solo en overlays (dropdown/dialog), nunca borde+sombra ancha juntos.
- Espaciado base 4px (4/8/12/16/24/32/48); densidad bienvenida en tablas y listas.

## Components

- **Botones:** `.action-button` primario (cobalto, texto blanco), `.ghost-button` secundario (borde, tinta), `.danger-button` destructivo. Estados: hover, focus-visible (anillo 2px primary con offset), disabled (opacidad 0.5, cursor not-allowed), loading (texto "…ando" + disabled).
- **Campos:** `.field` con label arriba (texto ink 500), input borde `--line`, focus borde primary + anillo; error: borde danger + mensaje `.field-error` asociado.
- **Paneles:** `.panel` blanco, borde 1px, radio 10px, padding 24px.
- **Estado vacio:** `.empty-state` enseña la accion siguiente, nunca "no hay datos" a secas.
- **Mensajes:** `.form-error` (danger-soft) y `.form-success` (primary-soft) con rol status/alert.

## Motion

150-200ms, ease-out; solo cambio de estado (hover, focus, aparicion de mensajes). Sin coreografias de carga. `prefers-reduced-motion: reduce` desactiva todo a transicion instantanea.

## Layout

- Shell del medico: barra superior fija (marca + nav Agenda/Configuracion + salir), contenido `min(1080px, 100% - 32px)`.
- Auth: tarjeta unica centrada `max-width 420px` sobre `--surface`.
- Responsive estructural: columnas → apilado bajo 860px; tablas con scroll horizontal.
