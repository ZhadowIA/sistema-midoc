"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/medico/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="ghost-button" onClick={() => void logout()} disabled={busy}>
      {busy ? "Cerrando sesion…" : "Cerrar sesion"}
    </button>
  );
}
