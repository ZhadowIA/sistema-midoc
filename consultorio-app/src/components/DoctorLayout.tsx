"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Calendar, Settings, LayoutDashboard, LogOut, Menu, X, Users, Moon, CreditCard, PieChart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "@/components/ThemeProvider";

type ProductFeatureRecord = Record<string, unknown>;
type ProductModule = "AGENDA" | "CLINICAL_RECORDS";

interface DoctorLayoutProps {
  children: ReactNode;
}

function deriveModulesFromFeatures(features: ProductFeatureRecord): ProductModule[] {
  const modules: ProductModule[] = [];

  if (features["agenda.enabled"] === true) {
    modules.push("AGENDA");
  }

  if (features["clinical.enabled"] === true || features["clinical.history"] === true) {
    modules.push("CLINICAL_RECORDS");
  }

  return modules;
}

export const DoctorLayout = ({ children }: DoctorLayoutProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [doctorName, setDoctorName] = useState("Cargando...");
  const [doctorSpecialty, setDoctorSpecialty] = useState("");
  const [doctorImage, setDoctorImage] = useState("");
  const [waConnected, setWaConnected] = useState(false);
  const [userRole, setUserRole] = useState<string>("DOCTOR");
  const [enabledModules, setEnabledModules] = useState<ProductModule[]>([
    "AGENDA",
    "CLINICAL_RECORDS",
  ]);

  useEffect(() => {
    const loadDoctorProfile = async () => {
      try {
        const res = await fetch("/api/admin/profile", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || data?.error) {
          throw new Error(data?.error || "No se pudo cargar el perfil.");
        }

        setDoctorName(typeof data.name === "string" && data.name.trim() ? data.name : "Doctor");
        setDoctorSpecialty(
          typeof data.specialty === "string" && data.specialty.trim()
            ? data.specialty
            : "Médico"
        );
        setDoctorImage(typeof data.profileImage === "string" ? data.profileImage : "");
        setUserRole(data.role || "DOCTOR");

        const features =
          data.features && typeof data.features === "object" && !Array.isArray(data.features)
            ? (data.features as ProductFeatureRecord)
            : null;

        if (features) {
          const modulesFromFeatures = deriveModulesFromFeatures(features);
          if (modulesFromFeatures.length > 0) {
            setEnabledModules(modulesFromFeatures);
            return;
          }
        }

        if (Array.isArray(data.enabledModules)) {
          const modules = data.enabledModules.filter(
            (item: unknown): item is ProductModule =>
              item === "AGENDA" || item === "CLINICAL_RECORDS"
          );
          if (modules.length > 0) {
            setEnabledModules(modules);
          }
        }
      } catch {
        setDoctorName("Doctor");
        setDoctorSpecialty("Médico");
        setDoctorImage("");
      }
    };

    const loadConfig = async () => {
      try {
        const res = await fetch("/api/admin/config", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data?.whatsappConnected !== undefined) {
          setWaConnected(!!data.whatsappConnected);
        }
      } catch {
        setWaConnected(false);
      }
    };

    void loadDoctorProfile();
    void loadConfig();

    let intervalId: number | null = null;
    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(loadConfig, 60000);
    };
    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadConfig();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);

  useEffect(() => {
    if (userRole === "SECRETARY") {
      const restrictedPaths = [
        "/medico/pacientes",
        "/medico/contabilidad",
        "/medico/suscripcion",
        "/medico/configuracion",
        "/medico/cuestionarios"
      ];
      if (restrictedPaths.some(p => pathname.startsWith(p))) {
        router.replace("/medico/agenda");
      }
    }
  }, [userRole, pathname, router]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      router.push('/medico/login');
    });
  };

  const { toggle } = useTheme();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/medico/dashboard", module: "AGENDA" as const },
    { icon: Calendar, label: "Agenda", path: "/medico/agenda", module: "AGENDA" as const },
    { icon: PieChart, label: "Contabilidad", path: "/medico/contabilidad", doctorOnly: true, module: "AGENDA" as const },
    { icon: Users, label: "Pacientes", path: "/medico/pacientes", doctorOnly: true, module: "CLINICAL_RECORDS" as const },
    { icon: CreditCard, label: "Suscripción", path: "/medico/suscripcion", doctorOnly: true },
    { icon: Settings, label: "Configuración", path: "/medico/configuracion", doctorOnly: true },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (userRole === "SECRETARY" && item.doctorOnly) return false;
    if (item.module && !enabledModules.includes(item.module)) return false;
    return true;
  });
  const agendaItems = filteredNavItems.filter((item) => item.module === "AGENDA");
  const clinicalItems = filteredNavItems.filter((item) => item.module === "CLINICAL_RECORDS");
  const commonItems = filteredNavItems.filter((item) => !item.module);

  const initials = doctorName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase();

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            {/* Stethoscope icon via SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
              <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
              <circle cx="20" cy="10" r="2" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-foreground leading-none">MiDoc</p>
            <p className="text-xs text-muted-foreground mt-0.5">Panel Médico</p>
          </div>
        </div>
      </div>

      {/* Doctor profile */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border shrink-0">
              {doctorImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doctorImage} alt={doctorName} className="w-full h-full object-cover" />
              ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-primary bg-primary/10">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm truncate">{doctorName}</p>
            <p className="text-xs text-muted-foreground truncate">{doctorSpecialty || "Médico"}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {agendaItems.length > 0 && (
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
            Agenda
          </p>
        )}
        {agendaItems.map((item) => {
          const isActive = pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex min-h-[48px] items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {clinicalItems.length > 0 && (
          <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
            Expediente clínico
          </p>
        )}
        {clinicalItems.map((item) => {
          const isActive = pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex min-h-[48px] items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {commonItems.length > 0 && (
          <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
            Cuenta
          </p>
        )}
        {commonItems.map((item) => {
          const isActive = pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex min-h-[48px] items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-1">
        {/* WhatsApp status */}
        <div className="mx-2 mb-2 px-3 py-2 bg-secondary rounded-xl flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${waConnected ? "bg-success" : "bg-muted-foreground"}`} />
          <span className="text-xs text-foreground font-medium">
            WhatsApp {waConnected ? "conectado" : "desconectado"}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex min-h-[48px] items-center gap-3 px-3 py-2.5 rounded-xl w-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all text-sm"
        >
          <Moon className="w-4 h-4 shrink-0" />
          <span>Cambiar tema</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex min-h-[48px] items-center gap-3 px-3 py-2.5 rounded-xl w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all text-sm"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:sticky lg:top-0 h-screen overflow-y-auto flex-col w-72 bg-card border-r border-border shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-card border-b border-border z-40 h-14">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                <circle cx="20" cy="10" r="2" />
              </svg>
            </div>
            <span className="font-semibold text-foreground">MiDoc</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/30 z-40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-card z-50 flex flex-col"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
};
