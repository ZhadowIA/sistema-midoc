---
name: MiDoc
description: Sistema de gestión clínica SaaS para médicos y clínicas privadas en México.
colors:
  institutional-blue: "#2563EB"
  institutional-blue-deep: "#1D4ED8"
  clinical-white: "#FAFAF8"
  surface-white: "#FFFFFF"
  slate-graphite: "#1F2937"
  night-sidebar: "#111827"
  surface-secondary: "#F3F4F6"
  surface-muted: "#E5E7EB"
  text-subdued: "#6B7280"
  border-default: "#D1D5DB"
  status-critical: "#DC2626"
  status-success: "#16A34A"
  status-warning: "#F59E0B"
  status-accent: "#3B82F6"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.institutional-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.institutional-blue-deep}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.slate-graphite}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-subdued}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-default:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.slate-graphite}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-default:
    backgroundColor: "#F9FAFB"
    textColor: "{colors.slate-graphite}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: MiDoc

## 1. Overview

**Creative North Star: "The Clinical Workbench"**

MiDoc is the practitioner's workbench: a surface where every tool is exactly where it should be, nothing demands attention it has not earned, and the system gets out of the way when the doctor is doing the actual work. The interface reads like a well-organized clinic room: clean, purposeful, with clear visual hierarchy that works under time pressure.

Density is calibrated, not avoided. Data modules (agenda, patient list, odontogram) earn high density because experts need information fast. Capture screens (forms, SOAP notes) pull back to give breathing room. The system knows the difference and behaves accordingly.

This system rejects two failure modes: legacy medical software that looks like a 2005 hospital intranet (dense gray tables, no hierarchy, forms everywhere), and the "wellness app" aesthetic (soft pastel gradients, friendly illustrations, rounded-everything) that communicates approachability at the expense of clinical authority.

**Key Characteristics:**
- High information density with deliberate visual hierarchy
- Institutional Blue as the single trust anchor, used sparingly and never decoratively
- Flat surfaces with tonal layering; shadows only on floating layers (popovers, modals)
- System sans-serif: legible under time pressure at small sizes
- Dark sidebar as permanent structural anchor; content area stays on Clinical White
- Status colors communicate real clinical state, never aesthetics

## 2. Colors: The Workbench Palette

A restrained palette built on one trust anchor surrounded by calibrated slate neutrals. Color communicates state, not decoration.

### Primary
- **Institutional Blue** (`#2563EB`): The sole interactive accent. Primary buttons, active nav states, links, focus rings, progress indicators. Never a background for large surfaces.
- **Institutional Blue Deep** (`#1D4ED8`): Hover and pressed states for interactive elements only.

### Neutral
- **Clinical White** (`#FAFAF8`): Main content background. Slightly off-white; reduces eye strain during long clinical sessions.
- **Surface White** (`#FFFFFF`): Card and elevated surface backgrounds. Contrast with Clinical White is the resting elevation vocabulary.
- **Slate Graphite** (`#1F2937`): Primary text. Warm dark slate, never pure black.
- **Night Sidebar** (`#111827`): Sidebar background. The permanent dark anchor that grounds the interface.
- **Surface Secondary** (`#F3F4F6`): Ghost backgrounds, hover states, disabled fills.
- **Surface Muted** (`#E5E7EB`): Dividers, skeleton states.
- **Text Subdued** (`#6B7280`): Secondary text, labels, metadata.
- **Border Default** (`#D1D5DB`): Input strokes, card borders, dividers.

### Status
- **Critical** (`#DC2626`): Destructive actions, error states, urgent clinical alerts.
- **Success** (`#16A34A`): Confirmed states, completed procedures, positive results.
- **Warning** (`#F59E0B`): Pending states, attention required. Requires dark text for AA contrast.
- **Accent** (`#3B82F6`): Informational highlights, chart series 1.

### Named Rules
**The One Voice Rule.** Institutional Blue appears on 10% or less of any given screen. Its rarity is what makes it trustworthy.

**The Status Contract Rule.** Status colors are reserved exclusively for communicating real system or clinical state. A warning badge means something is actually pending.

## 3. Typography

**UI Font:** System sans-serif stack (`ui-sans-serif, system-ui, -apple-system, sans-serif`)

**Character:** A single clean sans-serif stack. Clinical, neutral, highly legible at small sizes. The weight scale (400/500/600/700) carries all hierarchy.

### Hierarchy
- **Display** (700, 30px, leading 1.2, tracking -0.02em): Page-level orientations, large modal headers. Used sparingly.
- **Headline** (600, 20px, leading 1.35, tracking -0.01em): Page titles, primary section headers in clinical modules.
- **Title** (600, 16px, leading 1.4): Panel headers, sidebar section labels, table column headings.
- **Body** (400, 14px, leading 1.6): All data content, clinical notes, descriptions. Max 65ch in reading contexts.
- **Label** (500, 12px, tracking +0.02em): Badges, status chips, metadata tags. Never below 12px.

### Named Rules
**The 14px Floor Rule.** No text in clinical data views runs smaller than 14px. Illegible type in a medical interface is a patient safety issue.

**The Weight Hierarchy Rule.** Adjacent text levels must differ by at least one weight step. Two items at 500/500 with only size difference is not enough contrast.

## 4. Elevation

Tonal layering is the primary elevation vocabulary: Clinical White (#FAFAF8) as the page surface, Surface White (#FFFFFF) for cards, Surface Secondary (#F3F4F6) for nested containers. Color contrast creates depth without any shadow at rest.

Shadows are reserved for floating and interactive layers only.

### Shadow Vocabulary
- **Ambient Low** (`0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)`): Hover state on interactive cards. Signals affordance, not importance.
- **Surface Lift** (`0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)`): Dropdowns, popovers, select menus, date pickers.
- **Overlay** (`0 10px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.08)`): Modals and dialogs. The highest floating layer.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow on a static card implies false affordance. Reserve shadows for elements that actually float.

## 5. Components

### Buttons
Compact and precise. The primary button is the only high-contrast element on any given toolbar.

- **Shape:** 6px radius
- **Primary:** `#2563EB` fill, white text, 14px/500 weight, `8px 16px` padding. Hover: `#1D4ED8`.
- **Focus:** 2px offset ring in Institutional Blue. Always visible, never removed.
- **Secondary:** `#F3F4F6` fill, Slate Graphite text. Same dimensions as primary.
- **Ghost:** Transparent, Text Subdued (`#6B7280`). Tertiary actions in dense toolbars.
- **Destructive:** `#DC2626` fill, white text. Only for confirmed irreversible actions.
- **Disabled:** 40% opacity, `not-allowed` cursor.

### Cards / Containers
- **Corner Style:** 8px radius
- **Background:** Surface White (`#FFFFFF`)
- **Border:** `1px solid #D1D5DB` only when the card surface matches the container behind it. On Clinical White, no border needed.
- **Shadow:** None at rest. Ambient Low on hover for interactive cards.
- **Internal Padding:** 16px standard; 12px for compact data cards.

### Inputs / Fields
- **Style:** `#F9FAFB` fill, `1px solid #D1D5DB` stroke, 6px radius.
- **Focus:** Blue border (`#2563EB` 2px) with ring at 25% opacity. No glow effects.
- **Error:** Critical Red border (`#DC2626`), no fill change.
- **Disabled:** Surface Muted fill, Text Subdued text.
- **Placeholder:** Text Subdued at full opacity.

### Navigation (Sidebar)
- **Background:** Night Sidebar (`#111827`), permanent on desktop.
- **Text:** `#F9FAFB` at rest; white on hover/active.
- **Active item:** `#1F2937` background + 2px Institutional Blue left dot as a positional indicator (the only permitted left-side accent in the system).
- **Typography:** 14px / 500 weight / no uppercase.
- **Icons:** Always 16px, always paired with text labels on desktop.

### Badges / Status Chips
- **Shape:** Full pill (99px radius)
- **Size:** 12px label, `2px 8px` padding
- **Filled:** Definitive states (Completed, Cancelled)
- **Tinted (10% bg):** Provisional states (Pending, In Progress)
- **Contrast:** Warning yellow (#F59E0B) requires dark text (`#1F2937`) for AA compliance.

### Clinical Modules (Signature Pattern)
Odontogram, periodontogram, and SOAP editor share a consistent interaction pattern: a data-dense primary surface + a step-by-step action panel on selection, using a 3-step flow (level, finding, confirmation) shared across all clinical modules. This pattern is MiDoc's most distinctive UI signature and must remain consistent across all specialties.

## 6. Do's and Don'ts

### Do:
- **Do** use Institutional Blue exclusively for primary interactive controls and active states. One color, one meaning.
- **Do** calibrate density by context: compact (14px, 12px padding) for data grids and clinical modules; relaxed (16px+, 24px+ padding) for forms and onboarding.
- **Do** keep the sidebar dark as the permanent structural anchor. Content area always stays on Clinical White.
- **Do** communicate every loading, saving, error, and success state inline. A doctor mid-consult cannot afford to wonder if their note saved.
- **Do** hold the 14px floor in all clinical data views.
- **Do** pair icon and text labels in all navigation and primary actions.
- **Do** use `#D1D5DB` at full opacity for dividers and borders. Never simulate borders with low-opacity text color.

### Don't:
- **Don't** use Institutional Blue decoratively or on large background surfaces. The One Voice Rule: rarity is the point.
- **Don't** use status colors for aesthetics. They communicate real clinical or system state only.
- **Don't** build dense gray tables with no hierarchy and undifferentiated text. This is the legacy medical software aesthetic MiDoc is replacing.
- **Don't** use wellness-app aesthetics: pastel gradients, friendly illustrations, script fonts, or soft rounded-everything. Clinical authority is communicated through structure and precision.
- **Don't** use `border-left` or `border-right` greater than 1px as a decorative color stripe on cards or list items. The only permitted left indicator is the 2px active dot in the sidebar.
- **Don't** use gradient text (`background-clip: text`). Emphasis comes from weight and size.
- **Don't** open a modal as the first solution for secondary actions. Exhaust inline, Sheet (slide-over), or progressive disclosure first.
- **Don't** render any text below 12px.
- **Don't** remove or suppress focus rings. WCAG AA is non-negotiable.
- **Don't** use identical same-size card grids with icon + heading + body text repeated. Generic SaaS filler; MiDoc's surfaces are specialized clinical tools.
