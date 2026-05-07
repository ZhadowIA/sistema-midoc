import React, { useMemo, useState } from "react";
import { Button } from "./components/Button";
import { Modal } from "./components/Modal";
import { Tabs } from "./components/Tabs";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { DashboardDoctorPage } from "./pages/DashboardDoctorPage";
import { ErrorStatesPage } from "./pages/ErrorStatesPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { LandingPage } from "./pages/LandingPage";
import { MobileRefinementPage } from "./pages/MobileRefinementPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PatientBookingPage } from "./pages/PatientBookingPage";
import { PricingPage } from "./pages/PricingPage";
import { SettingsPage } from "./pages/SettingsPage";

const views = [
  { id: "landing", label: "Landing", render: () => <LandingPage /> },
  { id: "pricing", label: "Pricing", render: () => <PricingPage /> },
  { id: "features", label: "Features", render: () => <FeaturesPage /> },
  { id: "dashboard", label: "Dashboard", render: () => <DashboardDoctorPage /> },
  { id: "onboarding", label: "Onboarding", render: () => <OnboardingPage /> },
  { id: "booking", label: "Booking", render: () => <PatientBookingPage /> },
  { id: "settings", label: "Settings", render: () => <SettingsPage /> },
  { id: "analytics", label: "Analytics", render: () => <AnalyticsPage /> },
  { id: "errors", label: "Errors", render: () => <ErrorStatesPage /> },
  { id: "mobile", label: "Mobile", render: () => <MobileRefinementPage /> },
];

export function App() {
  const [activeView, setActiveView] = useState("landing");
  const [darkMode, setDarkMode] = useState(false);
  const [openHelp, setOpenHelp] = useState(false);

  const activeRenderer = useMemo(() => views.find((v) => v.id === activeView)?.render ?? (() => null), [activeView]);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground dark:bg-slate-950 dark:text-slate-100">
        <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">MiDoc Clinical System</h1>
              <p className="text-xs text-muted-foreground">Workspace clínico · Prototipo UI con datos simulados</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpenHelp(true)}>Checklist</Button>
              <Button size="sm" variant="tertiary" onClick={() => setDarkMode((d) => !d)}>
                {darkMode ? "Light" : "Dark"}
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
          <Tabs tabs={views.map((v) => ({ id: v.id, label: v.label }))} activeTab={activeView} onChange={setActiveView} />
          <section role="tabpanel" id={`tabpanel-${activeView}`} aria-labelledby={`tab-${activeView}`}>
            {activeRenderer()}
          </section>
        </main>

        <Modal open={openHelp} onClose={() => setOpenHelp(false)} title="Checklist de rediseño de vistas">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-200">
            <li>Define para cada vista una tarea principal y una métrica de éxito.</li>
            <li>Prioriza jerarquía visual y legibilidad antes que efectos decorativos.</li>
            <li>Mantén patrones consistentes en tabs, tarjetas, formularios y feedback.</li>
            <li>Valida responsive y contraste en cada iteración.</li>
          </ol>
        </Modal>
      </div>
    </div>
  );
}
