# MiDoc Frontend (Design Reference)

Frontend duplicado **sin conexión a backend**, preparado para que Claude Design rediseñe vistas y proponga UI.

## Estado actual

- ✅ Estructura limpia (sin carpetas corruptas)
- ✅ Mock data centralizado en `src/data/mockData.ts`
- ✅ Librería base de componentes reutilizables
- ✅ 10 vistas del brief implementadas como referencia base
- ✅ Navegación interna por tabs para revisar todas las vistas

## Estructura

```txt
frontend/
├─ DESIGN_BRIEF.md
├─ index.html
├─ package.json
├─ postcss.config.cjs
├─ tailwind.config.js
├─ tsconfig.json
├─ vite.config.ts
├─ public/
│  ├─ assets/
│  └─ fonts/
└─ src/
   ├─ App.tsx
   ├─ main.tsx
   ├─ components/
   │  ├─ Badge.tsx
   │  ├─ Button.tsx
   │  ├─ Card.tsx
   │  ├─ FeedbackState.tsx
   │  ├─ Input.tsx
   │  ├─ Modal.tsx
   │  ├─ SectionAccordion.tsx
   │  └─ Tabs.tsx
   ├─ config/
   ├─ data/
   ├─ layout/
   ├─ pages/
   │  ├─ LandingPage.tsx
   │  ├─ PricingPage.tsx
   │  ├─ FeaturesPage.tsx
   │  ├─ DashboardDoctorPage.tsx
   │  ├─ OnboardingPage.tsx
   │  ├─ PatientBookingPage.tsx
   │  ├─ SettingsPage.tsx
   │  ├─ AnalyticsPage.tsx
   │  ├─ ErrorStatesPage.tsx
   │  └─ MobileRefinementPage.tsx
   ├─ styles/
   └─ utils/
```

## Uso local (opcional)

```bash
npm install
npm run dev
```

> Nota: este proyecto es para diseño/UI. No incluye backend, API calls ni Prisma.

## Flujo sugerido con Claude Design

1. Compartir esta carpeta completa + `DESIGN_BRIEF.md`
2. Pedir rediseño por vista (una a la vez)
3. Mantener mock data y componentes base como contrato de integración
4. Después, adaptar al frontend real conectado al backend
