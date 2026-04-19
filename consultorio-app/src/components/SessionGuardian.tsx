"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { INACTIVITY_TIMEOUT_MS, SESSION_REFRESH_INTERVAL_MS } from "@/lib/sessionConfig";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "pointerdown",
  "scroll",
];

function getLogoutTarget(pathname: string) {
  return pathname.startsWith("/paciente") ? "/paciente/login" : "/medico/login";
}

export function SessionGuardian() {
  const pathname = usePathname();
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    const shouldProtect =
      (pathname.startsWith("/paciente") &&
        !pathname.startsWith("/paciente/login") &&
        !pathname.startsWith("/paciente/registro")) ||
      (pathname.startsWith("/medico") &&
        !pathname.startsWith("/medico/login") &&
        !pathname.startsWith("/medico/registro"));
    if (!shouldProtect) return;

    const logout = async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      toast.warning("La sesión se cerró tras 15 minutos de inactividad.");
      router.replace(getLogoutTarget(pathname));
    };

    const scheduleLogout = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        void logout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const refreshSession = async () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < SESSION_REFRESH_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;

      const response = await fetch("/api/auth/session/refresh", {
        method: "POST",
        cache: "no-store",
      }).catch(() => null);

      if (response?.status === 401) {
        await logout();
      }
    };

    const markActivity = () => {
      scheduleLogout();
      void refreshSession();
    };

    scheduleLogout();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markActivity();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
