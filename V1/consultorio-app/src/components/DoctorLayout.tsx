"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Calendar, Settings, LayoutDashboard, LogOut, Menu, X, Users, Moon, CreditCard, PieChart, Brain, ClipboardList, ConciergeBell, Shield } from "lucide-react";
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
    { icon: LayoutDashboard, label: "Dashboard",    path: "/medico/dashboard",      module: "AGENDA" as const,           section: "principal" },
    { icon: Calendar,        label: "Agenda",        path: "/medico/agenda",          module: "AGENDA" as const,           section: "principal" },
    { icon: ConciergeBell,   label: "Recepción",     path: "/medico/recepcion",       module: "AGENDA" as const,           section: "principal" },
    { icon: Users,           label: "Pacientes",     path: "/medico/pacientes",       doctorOnly: true, module: "CLINICAL_RECORDS" as const, section: "pacientes" },
    { icon: ClipboardList,   label: "Cuestionarios", path: "/medico/cuestionarios",   doctorOnly: true, module: "CLINICAL_RECORDS" as const, section: "pacientes" },
    { icon: Brain,           label: "Gobernanza IA", path: "/medico/ia-gobernanza",   doctorOnly: true, section: "gestion" },
    { icon: PieChart,        label: "Contabilidad",  path: "/medico/contabilidad",    doctorOnly: true, module: "AGENDA" as const,           section: "gestion" },
    { icon: Settings,        label: "Configuración", path: "/medico/configuracion",   doctorOnly: true, section: "gestion" },
    { icon: Shield,          label: "Seguridad",     path: "/medico/seguridad",       roles: ["ADMIN", "CLINIC_ADMIN"], section: "gestion" },
    { icon: CreditCard,      label: "Suscripción",   path: "/medico/suscripcion",     doctorOnly: true, section: "gestion" },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (userRole === "SECRETARY" && item.doctorOnly) return false;
    if (Array.isArray(item.roles) && !item.roles.includes(userRole)) return false;
    if (item.module && !enabledModules.includes(item.module)) return false;
    return true;
  });
  const principalItems = filteredNavItems.filter((item) => item.section === "principal");
  const pacientesItems = filteredNavItems.filter((item) => item.section === "pacientes");
  const gestionItems = filteredNavItems.filter((item) => item.section === "gestion");

  const initials = doctorName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase();

  const renderNavSection = (label: string, items: typeof filteredNavItems) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <p className="px-3 pt-4 pb-1.5 text-[10px] font-semibold tracking-wider text-sidebar-muted uppercase">{label}</p>
        {items.map((item) => {
          const isActive = pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex min-h-[40px] items-center gap-3 px-3 py-2 rounded-md transition-all duration-150 text-xs font-medium ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: "linear-gradient(135deg, #C9A227, #A88420)" }}
        >
          M
        </div>
        <div>
          <p className="font-bold text-sidebar-foreground text-base leading-none">MiDoc</p>
          <p className="text-[10px] text-sidebar-muted-foreground mt-0.5">Panel Médico</p>
        </div>
      </div>

      {/* Nav — scrollable */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {renderNavSection("Principal", principalItems)}
        {renderNavSection("Pacientes", pacientesItems)}
        {renderNavSection("Gestión", gestionItems)}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1 shrink-0">
        {/* WhatsApp status */}
        <div className="px-3 py-2 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${waConnected ? "bg-green-500" : "bg-sidebar-muted"}`} />
          <span className="text-[10px] text-sidebar-muted-foreground font-medium">
            WhatsApp {waConnected ? "conectado" : "desconectado"}
          </span>
        </div>

        <button
          onClick={toggle}
          className="flex min-h-[36px] items-center gap-3 px-3 py-2 rounded-md w-full text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all text-xs"
        >
          <Moon className="w-4 h-4 shrink-0" />
          <span>Cambiar tema</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex min-h-[36px] items-center gap-3 px-3 py-2 rounded-md w-full text-sidebar-muted hover:text-red-400 hover:bg-sidebar-accent transition-all text-xs"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Cerrar sesión</span>
        </button>

        {/* Doctor profile */}
        <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-sidebar-primary/20 border border-sidebar-primary/30 shrink-0">
            {doctorImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doctorImage} alt={doctorName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-sidebar-primary">
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{doctorName}</p>
            <p className="text-[10px] text-sidebar-muted-foreground truncate">{doctorSpecialty || "Médico"} · Pro</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:sticky lg:top-0 h-screen overflow-y-auto flex-col w-56 bg-sidebar shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-sidebar border-b border-sidebar-border z-40 h-14">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: "linear-gradient(135deg, #C9A227, #A88420)" }}>
              M
            </div>
            <span className="font-semibold text-sidebar-foreground">MiDoc</span>
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
              className="lg:hidden fixed inset-0 bg-foreground/30 backdrop-blur-sm z-40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-56 bg-sidebar z-50 flex flex-col"
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
