"use client";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SpecialtySaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span
      className={`text-xs ${
        state === "saving"
          ? "text-muted-foreground animate-pulse"
          : state === "saved"
          ? "text-success"
          : "text-destructive"
      }`}
    >
      {state === "saving" ? "Guardando…" : state === "saved" ? "Guardado" : "Error al guardar"}
    </span>
  );
}

export function SpecialtyShell({
  label,
  saveState,
  loaded,
  children,
}: {
  label: string;
  saveState: SaveState;
  loaded: boolean;
  children: React.ReactNode;
}) {
  if (!loaded) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground animate-pulse">
        Cargando módulo clínico…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <SpecialtySaveIndicator state={saveState} />
      </div>
      {children}
    </div>
  );
}
