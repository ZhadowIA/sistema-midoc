# MiDoc Design System

## 1) Objetivo
Sistema visual clínico, sobrio y confiable para operación médica diaria.  
Prioriza claridad, legibilidad, estados explícitos y consistencia transversal.

## 2) Principios
1. Claridad clínica antes que decoración.
2. Una pantalla, una tarea principal.
3. Estados semánticos explícitos.
4. Consistencia entre módulos y componentes.
5. Accesibilidad y foco visible por defecto.

## 3) Tokens base

### Color
- `background`: `#F7F9FC`
- `foreground`: `#102A43`
- `primary`: `#2563EB`
- `primary-hover`: `#1D4ED8`
- `secondary`: `#F2F6FB`
- `border`: `#D9E2EC`
- `muted-foreground`: `#52606D`
- `success`: `#16A34A`
- `warning`: `#D97706`
- `destructive`: `#DC2626`
- `info`: `#0284C7`

### Tipografía
- Familia: `Inter, Geist, system-ui, sans-serif`
- Escala recomendada: 12 / 14 / 16 / 18 / 20 / 24 / 32
- Body: `16px` base, `line-height` relajado
- Métricas: usar números tabulares cuando aplique

### Espaciado
- Escala: `4, 8, 12, 16, 24, 32, 48`
- Touch targets mínimos: `44px`

### Radio y bordes
- Border base: `border`
- Radios: `xl`, `2xl` según componente

## 4) Componentes y reglas

### Button
- Variantes: `primary`, `secondary`, `tertiary`, `destructive`
- Solo una acción primaria dominante por bloque.
- Focus ring obligatorio con `primary`.

### Input
- Label visible siempre.
- Error semántico con `destructive`.
- Texto auxiliar breve y accionable.

### Tabs
- Tab activa con `primary`.
- Inactivas con `muted-foreground` + `secondary` en hover.
- Navegación por teclado requerida.

### Card
- Usar cuando exista agrupación real.
- Evitar “carditis” (todo en tarjetas).

### Badge
- Usar para estado, no como decoración.
- Variantes semánticas: info/success/warning/destructive/default.

### Modal
- Solo para decisiones focales.
- Debe cerrar con `Esc`, conservar foco y trampa de tabulación.

### FeedbackState
- Sin emojis.
- Estado por badge semántico + mensaje claro + acción concreta.

## 5) Estados semánticos UX
- `loading`: progreso visible.
- `success`: confirmación breve y clara.
- `error`: causa + cómo recuperarse.
- `empty`: contexto + próxima acción.

## 6) Do / Don’t

### Do
- Usar tokens globales.
- Mantener jerarquía textual clara.
- Priorizar contraste y lectura rápida.
- Reutilizar componentes base.

### Don’t
- Hardcodear colores por vista.
- Usar gradientes/efectos como identidad principal.
- Abusar de cards y sombras.
- Mezclar estilos visuales por módulo.

## 7) Checklist de aceptación visual
1. ¿Usa tokens del sistema?
2. ¿Hay una tarea principal clara?
3. ¿Estados y feedback son explícitos?
4. ¿Navegable con teclado y foco visible?
5. ¿Legible en móvil sin pérdida funcional?

## 8) Archivos fuente del sistema
- `frontend/tailwind.config.js`
- `frontend/src/styles/globals.css`
- `frontend/src/components/*`

