# MiDoc Frontend Redesign - Design Brief

## Contexto del Proyecto

**MiDoc** es una plataforma SaaS médica completa que integra:
- Gestión de citas y pacientes
- Consulta clínica con IA (generación automática de notas SOAP)
- Cuestionario pre-consulta con entrevista IA por voz o texto
- Gobernanza y trazabilidad de decisiones de IA
- Playbooks clínicos por especialidad (8 especialidades)
- Prescripciones, indicaciones para paciente, validaciones farmacológicas
- WhatsApp integration para notificaciones

**Usuarios principales:**
1. **Doctor/Médico especialista** — gestiona citas, realiza consultas, revisa sugerencias IA
2. **Paciente** — reserva citas, responde cuestionarios, ve indicaciones médicas
3. **Admin/Clínica** — supervisión de métricas, gobernanza, reportes

---

## Identidad Visual Actual

### Colores
- **Primary**: Azul y morado en modo oscuro(usado en botones, acciones principales)
- **Secondary**: Gris claro (fondos, elementos secundarios)
- **Destructive**: Rojo (alertas, acciones críticas)
- **Success**: Verde (confirmaciones, estados positivos)
- **Warning**: Ámbar (advertencias)
- **Muted**: Gris oscuro (textos secundarios)

### Tipografía
- **Font**: Geist / Inter (sans-serif)
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### Componentes Base Existentes
- `Button` — variants: primary, secondary, tertiary, destructive; sizes: sm, md, lg
- `Input` — text, email, password, number
- `Card` — contenedor base con borde y sombra
- `Badge` — etiquetas de estado
- `Modal` — diálogos
- `SectionAccordion` — secciones colapsables
- `FeedbackState` — loading, error, success, empty states

### Principios de Diseño
- **Accesibilidad**: WCAG AA mínimo
- **Mobile-first**: Responsive en phones, tablets, desktop
- **Dark mode**: Soporte completo (colores adaptados)
- **Animaciones**: Micro-interacciones sutiles con Framer Motion
- **Velocidad**: Transiciones < 200ms, interacciones < 100ms

---

## Vistas a Diseñar / Mejorar

### 1. **Landing Page** (NUEVA)
**Propósito**: Captar y convertir visitantes, explicar value proposition

**Secciones**:
- Hero section — headline, subheadline, CTA principal ("Comenzar gratis")
- Value props en 3-4 tarjetas (IA, Playbooks, Gobernanza, Mobile)
- Feature carousel o grid — destaque de capacidades clave
- Testimonios / casos de uso
- Pricing teaser (link a pricing page)
- FAQ section
- CTA final antes del footer

**Wireframe mental**:
```
┌─ NAVBAR (Logo + Login) ─────────────────────┐
│                                              │
│  Hero: "Tu copiloto clínico de IA"          │
│         Subtítulo + 2 CTA buttons           │
│                                              │
├─ Valor props en 3 cards ──────────────────┤
├─ Feature showcase (4 item grid) ──────────┤
├─ Testimonios (carousel o grid) ───────────┤
├─ Pricing (preview) ──────────────────────┤
├─ FAQ ─────────────────────────────────────┤
└─ Footer (links, social) ──────────────────┘
```

**Tone**: Profesional, accesible, confiable. Dirigido a médicos/clínicas.

---

### 2. **Pricing / Planes** (NUEVA)
**Propósito**: Mostrar opciones de suscripción, facilitar comparación

**Planes**:
- Free (básico)
- Pro (médico individual)
- Enterprise (clínica multi-médico)

**Elementos**:
- Toggle annual/monthly (descuento visible)
- Card por plan: nombre, precio, descripción, feature list, CTA
- Comparativa table detallada (abajo)
- FAQ de billing
- Contact sales link para Enterprise

**Wireframe**:
```
┌─ Toggle: Facturación Anual / Mensual ─┐
├─ Grid 3 cards (Free | Pro | Enterprise) ────┤
│  ┌─ Plan name ─┐  ┌─ Plan name ─┐  ┌─ Plan name ─┐
│  │ $0/mo       │  │ $49/mo      │  │ Custom      │
│  │ [Features]  │  │ [Features]  │  │ [Features]  │
│  │ [CTA]       │  │ [CTA]       │  │ [CTA]       │
│  └─────────────┘  └─────────────┘  └─────────────┘
├─ Comparativa table (features x planes) ────┤
└─ FAQ ──────────────────────────────────────┘
```

**Highlights**:
- Plan Pro destacado (recomendado)
- Indicador "Más popular"
- Green checkmark para features incluidas

---

### 3. **Features Showcase** (NUEVA)
**Propósito**: Demostrar capacidades en detalle, educar sobre beneficios

**Secciones por feature**:
1. **IA Clínica** — nota SOAP automática, insights, validación farmacológica
2. **Playbooks** — 8 especialidades, templates estructurados
3. **Gobernanza** — trazabilidad, métricas, auditoría
4. **Entrevista IA por voz** — VAD inteligente, auto-respuestas
5. **Integración WhatsApp** — notificaciones, recordatorios
6. **Cuestionario pre-consulta** — IA + manual, captura de antecedentes

**Patrón por feature**:
```
┌─ Título + descripción breve ─────┐
├─ Hero image/screenshot ──────────┤
├─ 2-3 bullet points de beneficio ─┤
└─ CTA "Explorar" / Link ──────────┘
```

---

### 4. **Dashboard Doctor** (MEJORA)
**Actual**: Funcional pero información dispersa, poco visual

**Mejoras propuestas**:
- **Sidebar colapsable** — mejor uso de espacio en mobile
- **Header sticky** — perfil doctor + notificaciones siempre visibles
- **Widget grid** — citas hoy, pacientes nuevos, uso IA (últimos 7 días), gobernanza
- **Quick actions** — botones flotantes para Nueva cita, Nuevo paciente
- **Search global** — buscar pacientes, citas, notas
- **Notificaciones** — toast system mejorado + centro de notificaciones
- **Dark mode toggle** — accesible desde perfil

**Estructura**:
```
┌─ Sidebar ─┬─ Header (notif + perfil) ─────────────┐
│ Nav items │                                        │
│           ├─ Welcome card ────────────────────────┤
│           ├─ Grid 4 widgets (citas, pacientes, IA) ┤
│           ├─ Upcoming appointments ────────────────┤
│           └─ Recent patients / notes ───────────────┤
└───────────┴────────────────────────────────────────┘
```

---

### 5. **Onboarding Flow** (MEJORA)
**Actual**: 3-step básico (suscripción → onboarding → dashboard)

**Mejoras**:
- **Step 1: Especialidad** — selector visual con iconos (8 opciones)
- **Step 2: Horarios** — calendar picker + repetición semanal
- **Step 3: Datos clínica** — nombre, dirección, teléfono
- **Step 4: Foto perfil + firma digital** — opcional pero recomendado
- **Progress bar** — visual clear de avance
- **Tooltips contextuales** — ayuda en cada campo
- **Skip option** — completar después desde settings

---

### 6. **Patient Booking View** (MEJORA)
**Actual**: Básico, funcional

**Mejoras**:
- **Visual calendar** — mes completo + slots disponibles
- **Specialist filter** — si clínica tiene múltiples médicos
- **Time slot picker** — horarios libres en tarjetas
- **Confirmation preview** — resumen antes de confirmar
- **Success state** — con número de cita + QR / link para WhatsApp
- **Mobile optimized** — full-screen en phones

**Flow**:
```
1. Select Specialist (si aplica)
2. Pick Date (calendar)
3. Pick Time (grid de slots)
4. Confirm & Review
5. Payment (si aplica)
6. Confirmation screen
```

---

### 7. **Settings / Doctor Config** (MEJORA)
**Actual**: Formularios largos, poco estructura

**Mejoras**:
- **Tab layout** — Perfil | Especialidad | Horarios | Clínica | Seguridad
- **Visual specialty selector** — iconos + nombre
- **Weekly schedule editor** — drag-drop o inputs por día
- **Clinic data** — logo uploader, dirección, teléfono
- **Integration settings** — WhatsApp, payment gateway
- **Account security** — change password, 2FA, sessions activas
- **Preferences** — idioma, moneda, plantillas predeterminadas

**Tab structure**:
```
┌─ PERFIL ─────────────────┐
│ Foto | Nombre | Email    │
│ Especialidad (dropdown)  │
│ Teléfono | Bio           │
├─ HORARIOS ──────────────┤
│ Semana: Lun-Dom         │
│ Hora inicio/fin          │
│ Pausas (agregar)         │
├─ CLÍNICA ───────────────┤
│ Logo | Nombre            │
│ Dirección | Teléfono     │
├─ SEGURIDAD ──────────────┤
│ Password | 2FA           │
│ Sessions activas         │
└──────────────────────────┘
```

---

### 8. **Analytics / Gobernanza Dashboard** (MEJORA)
**Actual**: Tablas funcionales, datos mostrados

**Mejoras visuales**:
- **Stat cards con sparklines** — trending 7-day en cada métrica
- **Charts mejorados** — line chart de costo diario, pie de módulos, bar de especialidades
- **Heatmap** — uso por hora/día (patrón de uso)
- **Comparison** — mes actual vs mes anterior
- **Export button** — CSV / PDF de reportes
- **Date range picker** — predefinido + custom ranges
- **Filtros aplicables** — por módulo, modelo, especialidad

**Layout**:
```
┌─ Stats row (4 cards con sparklines) ─────┐
├─ Grid 2: line chart | pie chart ─────────┤
├─ Bar chart: uso por especialidad ────────┤
├─ Heatmap: uso por hora/día ──────────────┤
├─ Adopción de insights (bars by kind) ────┤
└─ Daily series table ──────────────────────┘
```

---

### 9. **Error Pages & Feedback States** (NUEVA)
**Propósito**: Mantener branding + orientar al usuario en errores

**Páginas**:
- 404 — "Página no encontrada" + home link
- 500 — "Error del servidor" + contact support
- 403 — "Acceso denegado" (sin permiso)
- 429 — "Demasiadas solicitudes" (rate limit)

**Empty states** (cuando no hay datos):
- Citas vacías → "No hay citas programadas"
- Pacientes vacíos → "Comienza agregando tu primer paciente"
- Notas vacías → "Aún no hay notas clínicas"

**Patrón**:
```
┌─ Illustration / Icon ──────┐
├─ Headline ─────────────────┤
├─ Brief explanation ────────┤
└─ CTA buttons ──────────────┘
```

---

### 10. **Mobile Refinement** (MEJORA)
**Actual**: Responsive básico

**Mejoras**:
- **Bottom navigation** — tabs para doctor (Citas | Pacientes | IA | Gobernanza | Perfil)
- **Floating action button** — Nueva cita (siempre visible)
- **Hamburger menu** — settings + logout
- **Larger touch targets** — 44px mínimo
- **Typography scaling** — legible sin zoom
- **Keyboard navigation** — sin touch
- **Orientation support** — landscape + portrait

---

## Principios de Diseño para el Rediseño

1. **Jerarquía clara** — información importante primero, detalles en segundo plano
2. **Consistencia** — mismo spacing, colores, tipografía en todas las vistas
3. **Menos es más** — eliminar ruido visual, destacar lo importante
4. **Accesibilidad** — contraste suficiente, tamaño de texto, alt text
5. **Performance** — lazy loading de imágenes, optimización de componentes
6. **Usabilidad** — flujos claros, CTAs obvios, feedback inmediato
7. **Branding** — mantener identidad MiDoc, agregar elegancia sin perder profundidad

---

## Constraints & Consideraciones

- **Browser support**: Chrome, Firefox, Safari, Edge últimas 2 versiones
- **Mobile**: iOS Safari, Chrome Android
- **Accessibility**: WCAG 2.1 AA
- **Performance**: Lighthouse > 90 en todas métricas
- **Bundle size**: Total < 200KB gzipped
- **Theming**: Light + Dark mode
- **Internacionalización**: Actualmente ES, preparar para EN/PT

---

## Deliverables del Rediseño

1. **Component Library** — Button, Card, Input, Badge, etc. mejorados y extendidos
2. **10 vistas diseñadas** — Landing, Pricing, Features, Dashboard, etc.
3. **Design system** — spacing scale, color palette, typography scale
4. **Responsive mockups** — mobile, tablet, desktop para cada vista
5. **Interaction specs** — animaciones, hover states, focus states
6. **Code** — React + Tailwind, listo para integración con backend

---

## Timeline Sugerido

- **Fase 1** (Days 1-3): Landing + Pricing + Features showcase
- **Fase 2** (Days 4-6): Dashboard + Onboarding + Patient booking
- **Fase 3** (Days 7-9): Settings + Gobernanza analytics + Error pages
- **Fase 4** (Days 10+): Mobile refinement + Component library docs

---

## Preguntas para Claude Design

1. ¿Qué estilo de hero image para landing? (Abstract, medical, SaaS generic)
2. ¿Plan Pro debe estar destacado vs. Enterprise en pricing?
3. ¿Sidebar fixed o colapsable en dashboard?
4. ¿Animaciones entrance sutiles o más dinámicas?
5. ¿Colores adicionales o paleta actual es suficiente?
