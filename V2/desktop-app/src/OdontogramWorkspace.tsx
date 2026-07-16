import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_DENTAL_PAYLOAD,
  getDefaultDentalToothRecord,
  RESTORATION_MATERIAL_OPTIONS,
  SURFACE_STATUS_OPTIONS,
  TOOTH_FACES,
  TOOTH_STATUS_OPTIONS,
  type DentalPayload,
  type DentalToothRecord,
  type RestorationMaterial,
  type SurfaceCondition,
  type ToothFace,
  type ToothStatus
} from "./clinicalProfiles.ts";
import { DentalDictationPanel } from "./DentalDictationPanel.tsx";
import { call } from "./ipc.ts";
import { OdontogramChart } from "./OdontogramChart.tsx";
import {
  applyOdontogramTool,
  compareTeeth,
  dentalPayloadFingerprint,
  hasHistoricalToothFinding,
  initialSignedPayload,
  parseSignedDentalHistory,
  recordUndoAction,
  redoOdontogramAction,
  resetToothFindings,
  undoOdontogramAction,
  type OdontogramTool,
  type OdontogramUndoState,
  type SignedDentalHistoryEntry,
  type SpecialtyHistoryEntry,
  type ToothDifference
} from "./odontogramWorkspaceModel.ts";
import { describeTooth, toothType } from "./odontogramModel.ts";

type ViewMode = "CURRENT" | "ARRIVAL" | "CHANGES";
type DrawerTab = "DETAIL" | "HISTORY";

const EMPTY_UNDO_STATE: OdontogramUndoState = { past: [], future: [] };
const SURFACE_TOOLS: Array<{ condition: SurfaceCondition; label: string; mark: string }> = [
  { condition: "HEALTHY", label: "Sano / limpiar", mark: "–" },
  { condition: "CARIES", label: "Caries", mark: "C" },
  { condition: "RESTORED", label: "Restauracion", mark: "R" },
  { condition: "SEALANT", label: "Sellador", mark: "S" },
  { condition: "FRACTURE", label: "Fractura", mark: "F" }
];
const TOOTH_TOOL_MARKS: Record<ToothStatus, string> = {
  HEALTHY: "–",
  CARIES: "C",
  RESTORED: "R",
  CROWN: "○",
  MISSING: "×",
  IMPLANT: "I",
  ROOT_CANAL: "△",
  FRACTURE: "/",
  EXTRACTION_INDICATED: "E"
};

function toolKey(tool: OdontogramTool | null): string {
  if (!tool) return "";
  return tool.scope === "TOOTH"
    ? `TOOTH:${tool.status}`
    : `SURFACE:${tool.condition}:${tool.material ?? ""}`;
}

function toothTypeLabel(toothId: string): string {
  const labels = {
    INCISOR: "Incisivo",
    CANINE: "Canino",
    PREMOLAR: "Premolar",
    MOLAR: "Molar"
  } as const;
  return labels[toothType(toothId)];
}

function formatSignedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function differenceLabel(difference: ToothDifference): string {
  const parts: string[] = [];
  if (difference.statusChanged) parts.push("estado");
  if (difference.changedFaces.length > 0) parts.push(`caras ${difference.changedFaces.join(", ")}`);
  if (difference.notesChanged) parts.push("notas");
  return parts.length > 0 ? `Cambios en ${parts.join(" · ")}` : "Sin cambios frente al registro anterior";
}

function ToolPalette({
  activeTool,
  pinned,
  material,
  disabled,
  onMaterialChange,
  onSelectTool,
  onTogglePinned
}: {
  activeTool: OdontogramTool | null;
  pinned: boolean;
  material: RestorationMaterial;
  disabled: boolean;
  onMaterialChange: (material: RestorationMaterial) => void;
  onSelectTool: (tool: OdontogramTool) => void;
  onTogglePinned: () => void;
}) {
  const activeKey = toolKey(activeTool);
  return (
    <aside className="odontogram-tools" aria-label="Herramientas del odontograma">
      <div className="odontogram-tools-heading">
        <div>
          <span className="eyebrow">Captura directa</span>
          <h4>Herramientas</h4>
        </div>
        <button
          className={`tool-pin${pinned ? " active" : ""}`}
          type="button"
          disabled={disabled || !activeTool}
          aria-pressed={pinned}
          onClick={onTogglePinned}
        >
          {pinned ? "Fijada" : "Fijar"}
        </button>
      </div>
      <div className="tool-group">
        <span className="tool-group-label">Superficie</span>
        <div className="tool-list">
          {SURFACE_TOOLS.map((tool) => {
            const value: OdontogramTool = {
              scope: "SURFACE",
              condition: tool.condition,
              material: tool.condition === "RESTORED" ? material : undefined
            };
            return (
              <button
                key={tool.condition}
                type="button"
                disabled={disabled}
                className={`clinical-tool tool-${tool.condition.toLowerCase()}${
                  activeKey === toolKey(value) ? " active" : ""
                }`}
                aria-pressed={activeKey === toolKey(value)}
                onClick={() => onSelectTool(value)}
              >
                <span className="clinical-tool-mark" aria-hidden>{tool.mark}</span>
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
        <label className="field compact-field material-field">
          <span>Material restaurador</span>
          <select
            value={material}
            disabled={disabled}
            onChange={(event) => onMaterialChange(event.currentTarget.value as RestorationMaterial)}
          >
            {RESTORATION_MATERIAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="tool-group">
        <span className="tool-group-label">Pieza completa</span>
        <div className="tool-list tool-list-dense">
          {TOOTH_STATUS_OPTIONS.map((option) => {
            const value: OdontogramTool = { scope: "TOOTH", status: option.value };
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                className={`clinical-tool tool-${option.value.toLowerCase()}${
                  activeKey === toolKey(value) ? " active" : ""
                }`}
                aria-pressed={activeKey === toolKey(value)}
                onClick={() => onSelectTool(value)}
              >
                <span className="clinical-tool-mark" aria-hidden>{TOOTH_TOOL_MARKS[option.value]}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="tool-help">Un uso por defecto. Fija una herramienta para aplicarla varias veces.</p>
    </aside>
  );
}

function ToothDetail({
  toothId,
  payload,
  baseline,
  disabled,
  onCommit
}: {
  toothId: string;
  payload: DentalPayload;
  baseline: DentalPayload | null;
  disabled: boolean;
  onCommit: (next: DentalPayload) => void;
}) {
  const tooth = payload.odontogram[toothId] ?? getDefaultDentalToothRecord();
  const difference = baseline
    ? compareTeeth(tooth, baseline.odontogram[toothId])
    : null;

  function updateTooth(nextTooth: DentalToothRecord) {
    onCommit({
      ...payload,
      odontogram: { ...payload.odontogram, [toothId]: nextTooth }
    });
  }

  function updateSurface(face: ToothFace, condition: SurfaceCondition) {
    const surfaces = { ...tooth.surfaces };
    if (condition === "HEALTHY") {
      delete surfaces[face];
    } else {
      const existingMaterial = condition === "RESTORED" ? surfaces[face]?.material : undefined;
      surfaces[face] = existingMaterial ? { condition, material: existingMaterial } : { condition };
    }
    updateTooth({ ...tooth, surfaces });
  }

  function updateMaterial(face: ToothFace, material: RestorationMaterial | "") {
    const surface = tooth.surfaces[face];
    if (!surface || surface.condition !== "RESTORED") return;
    updateTooth({
      ...tooth,
      surfaces: {
        ...tooth.surfaces,
        [face]: material ? { ...surface, material } : { condition: "RESTORED" }
      }
    });
  }

  return (
    <div className="tooth-drawer-detail">
      {difference?.changed ? (
        <div className="tooth-change-summary" role="status">
          <strong>Diferente al estado de llegada</strong>
          <span>{differenceLabel(difference)}</span>
        </div>
      ) : baseline ? (
        <p className="tooth-no-change">Sin cambios frente al estado de llegada.</p>
      ) : null}
      <label className="field compact-field">
        <span>Estado de la pieza</span>
        <select
          value={tooth.status}
          disabled={disabled}
          onChange={(event) => updateTooth({ ...tooth, status: event.currentTarget.value as ToothStatus })}
        >
          {TOOTH_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="drawer-surface-list">
        {TOOTH_FACES.map((face) => {
          const surface = tooth.surfaces[face];
          return (
            <div className="drawer-surface-row" key={face}>
              <span className="surface-face-label">{face}</span>
              <label className="field compact-field">
                <span>Condicion</span>
                <select
                  value={surface?.condition ?? "HEALTHY"}
                  disabled={disabled}
                  onChange={(event) => updateSurface(face, event.currentTarget.value as SurfaceCondition)}
                >
                  {SURFACE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="field compact-field">
                <span>Material</span>
                <select
                  value={surface?.material ?? ""}
                  disabled={disabled || surface?.condition !== "RESTORED"}
                  onChange={(event) => updateMaterial(face, event.currentTarget.value as RestorationMaterial | "")}
                >
                  <option value="">Sin especificar</option>
                  {RESTORATION_MATERIAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
      <label className="field compact-field">
        <span>Notas clinicas</span>
        <textarea
          rows={3}
          value={tooth.notes}
          disabled={disabled}
          onChange={(event) => updateTooth({ ...tooth, notes: event.currentTarget.value })}
        />
      </label>
      {!disabled ? (
        <button
          type="button"
          className="danger-ghost-button"
          disabled={tooth.status === "HEALTHY" && Object.keys(tooth.surfaces).length === 0}
          onClick={() => {
            if (window.confirm(`Restablecer los hallazgos de la pieza ${toothId}? Las notas se conservaran.`)) {
              onCommit(resetToothFindings(payload, toothId));
            }
          }}
        >
          Restablecer hallazgos
        </button>
      ) : null}
    </div>
  );
}

function ToothHistory({
  toothId,
  entries,
  loading,
  error
}: {
  toothId: string;
  entries: SignedDentalHistoryEntry[];
  loading: boolean;
  error: string;
}) {
  if (loading) {
    return <div className="tooth-history-skeleton" aria-label="Cargando historial" />;
  }
  if (error) {
    return <p className="inline-error">{error}</p>;
  }
  if (!hasHistoricalToothFinding(entries, toothId)) {
    return <p className="odontogram-empty-hint">Esta pieza no tiene hallazgos en consultas firmadas.</p>;
  }
  return (
    <ol className="tooth-timeline">
      {[...entries].reverse().map((entry, reverseIndex) => {
        const chronologicalIndex = entries.length - reverseIndex - 1;
        const previous = chronologicalIndex > 0 ? entries[chronologicalIndex - 1] : null;
        const record = entry.payload.odontogram[toothId];
        const difference = compareTeeth(record, previous?.payload.odontogram[toothId]);
        return (
          <li key={entry.encounterId}>
            <span className="timeline-dot" aria-hidden />
            <div className="timeline-heading">
              <strong>{formatSignedDate(entry.signedAt)}</strong>
              <span>Firmada</span>
            </div>
            <p>{describeTooth(toothId, record)}</p>
            <span className="timeline-difference">
              {previous ? differenceLabel(difference) : "Estado de llegada"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ToothDrawer({
  toothId,
  tab,
  payload,
  baseline,
  history,
  historyLoading,
  historyError,
  disabled,
  onTabChange,
  onClose,
  onCommit
}: {
  toothId: string;
  tab: DrawerTab;
  payload: DentalPayload;
  baseline: DentalPayload | null;
  history: SignedDentalHistoryEntry[];
  historyLoading: boolean;
  historyError: string;
  disabled: boolean;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onCommit: (next: DentalPayload) => void;
}) {
  return (
    <aside className="tooth-drawer" aria-label={`Detalle de pieza ${toothId}`}>
      <div className="tooth-drawer-header">
        <div>
          <span className="eyebrow">{toothTypeLabel(toothId)}</span>
          <h4>Pieza {toothId}</h4>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Cerrar detalle">×</button>
      </div>
      <div className="drawer-tabs" role="tablist" aria-label="Contenido de la pieza">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "DETAIL"}
          className={tab === "DETAIL" ? "active" : ""}
          onClick={() => onTabChange("DETAIL")}
        >Detalle</button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "HISTORY"}
          className={tab === "HISTORY" ? "active" : ""}
          onClick={() => onTabChange("HISTORY")}
        >Historial</button>
      </div>
      {tab === "DETAIL" ? (
        <ToothDetail
          toothId={toothId}
          payload={payload}
          baseline={baseline}
          disabled={disabled}
          onCommit={onCommit}
        />
      ) : (
        <ToothHistory
          toothId={toothId}
          entries={history}
          loading={historyLoading}
          error={historyError}
        />
      )}
    </aside>
  );
}

export function OdontogramWorkspace({
  patientId,
  encounterId,
  payload,
  persistedPayload,
  disabled,
  onChange
}: {
  patientId: string;
  encounterId: string;
  payload: DentalPayload;
  persistedPayload?: DentalPayload | null;
  disabled: boolean;
  onChange: (next: DentalPayload) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("CURRENT");
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("DETAIL");
  const [activeTool, setActiveTool] = useState<OdontogramTool | null>(null);
  const [pinned, setPinned] = useState(false);
  const [material, setMaterial] = useState<RestorationMaterial>("RESIN");
  const [dictationOpen, setDictationOpen] = useState(false);
  const [undoState, setUndoState] = useState<OdontogramUndoState>(EMPTY_UNDO_STATE);
  const [history, setHistory] = useState<SignedDentalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    setSelectedTooth(null);
    setActiveTool(null);
    setPinned(false);
    setUndoState(EMPTY_UNDO_STATE);
    setViewMode("CURRENT");
  }, [patientId, encounterId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");
    call<SpecialtyHistoryEntry[]>("dental_specialty_history", { patientId })
      .then((entries) => {
        if (!cancelled) setHistory(parseSignedDentalHistory(entries));
      })
      .catch(() => {
        if (!cancelled) {
          setHistory([]);
          setHistoryError("No fue posible cargar el historial firmado.");
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [patientId, encounterId]);

  const baseline = useMemo(() => initialSignedPayload(history), [history]);
  const displayedPayload = viewMode === "ARRIVAL" ? baseline ?? EMPTY_DENTAL_PAYLOAD : payload;
  const differences = useMemo(() => {
    if (viewMode !== "CHANGES" || !baseline) return undefined;
    const result = new Map<string, ToothDifference>();
    const ids = new Set([...Object.keys(payload.odontogram), ...Object.keys(baseline.odontogram)]);
    for (const toothId of ids) {
      const difference = compareTeeth(payload.odontogram[toothId], baseline.odontogram[toothId]);
      if (difference.changed) result.set(toothId, difference);
    }
    return result;
  }, [baseline, payload, viewMode]);
  const persisted = persistedPayload ?? EMPTY_DENTAL_PAYLOAD;
  const hasUnsavedChanges = dentalPayloadFingerprint(payload) !== dentalPayloadFingerprint(persisted);
  const editingDisabled = disabled || viewMode !== "CURRENT";

  function commit(next: DentalPayload) {
    if (dentalPayloadFingerprint(next) === dentalPayloadFingerprint(payload)) return;
    setUndoState((current) => recordUndoAction(current, payload));
    onChange(next);
  }

  function undo() {
    const result = undoOdontogramAction(undoState, payload);
    if (!result) return;
    setUndoState(result.state);
    onChange(result.payload);
  }

  function redo() {
    const result = redoOdontogramAction(undoState, payload);
    if (!result) return;
    setUndoState(result.state);
    onChange(result.payload);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isFormField = target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
      );
      if (event.key === "Escape") {
        setActiveTool(null);
        setPinned(false);
        return;
      }
      if (isFormField || disabled || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, payload, undoState]);

  function selectTool(tool: OdontogramTool) {
    setActiveTool((current) => toolKey(current) === toolKey(tool) ? null : tool);
  }

  function applyTool(toothId: string, face: ToothFace | null) {
    if (!activeTool || editingDisabled) return;
    commit(applyOdontogramTool(payload, toothId, face, activeTool));
    setSelectedTooth(toothId);
    if (!pinned) setActiveTool(null);
  }

  return (
    <section className="odontogram-workspace">
      <div className="odontogram-workspace-header">
        <div>
          <span className="eyebrow">Registro clinico visual</span>
          <h3>Odontograma</h3>
        </div>
        <div className="odontogram-header-actions">
          <div className="view-mode-toggle" role="group" aria-label="Vista del odontograma">
            {([
              ["CURRENT", "Actual"],
              ["ARRIVAL", "Llegada"],
              ["CHANGES", "Cambios"]
            ] as Array<[ViewMode, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={viewMode === value ? "active" : ""}
                aria-pressed={viewMode === value}
                onClick={() => {
                  setViewMode(value);
                  setActiveTool(null);
                  setPinned(false);
                }}
              >{label}</button>
            ))}
          </div>
          <button
            type="button"
            className={`ghost-button dictation-toggle${dictationOpen ? " active" : ""}`}
            aria-expanded={dictationOpen}
            onClick={() => setDictationOpen((current) => !current)}
          >Dictado</button>
          <span className={`draft-status${hasUnsavedChanges ? " dirty" : ""}`}>
            {disabled ? "Nota firmada" : hasUnsavedChanges ? "Cambios por guardar" : "Sin cambios"}
          </span>
        </div>
      </div>

      {dictationOpen ? (
        <div className="odontogram-dictation-region">
          <DentalDictationPanel
            patientId={patientId}
            encounterId={encounterId}
            payload={payload}
            disabled={disabled}
            onChange={commit}
          />
        </div>
      ) : null}

      {(viewMode === "ARRIVAL" || viewMode === "CHANGES") && !baseline && !historyLoading ? (
        <div className="odontogram-reference-empty" role="status">
          <strong>Aun no existe un estado de llegada firmado.</strong>
          <span>La primera consulta dental firmada se convertira en la referencia inicial.</span>
        </div>
      ) : null}

      <div className={`odontogram-workspace-grid${selectedTooth ? " drawer-open" : ""}`}>
        <ToolPalette
          activeTool={activeTool}
          pinned={pinned}
          material={material}
          disabled={editingDisabled}
          onMaterialChange={(nextMaterial) => {
            setMaterial(nextMaterial);
            if (activeTool?.scope === "SURFACE" && activeTool.condition === "RESTORED") {
              setActiveTool({ ...activeTool, material: nextMaterial });
            }
          }}
          onSelectTool={selectTool}
          onTogglePinned={() => setPinned((current) => !current)}
        />
        <div className="odontogram-canvas-region">
          <OdontogramChart
            payload={displayedPayload}
            disabled={editingDisabled}
            selectedTooth={selectedTooth}
            activeTool={activeTool}
            differences={differences}
            onSelectTooth={(toothId) => {
              setSelectedTooth(toothId);
              setDrawerTab("DETAIL");
            }}
            onApplyTool={applyTool}
          />
          <div className="odontogram-action-bar">
            <div className="undo-actions">
              <button type="button" className="ghost-button" disabled={disabled || undoState.past.length === 0} onClick={undo}>Deshacer</button>
              <button type="button" className="ghost-button" disabled={disabled || undoState.future.length === 0} onClick={redo}>Rehacer</button>
            </div>
            <span>Se guarda junto con la nota clinica.</span>
          </div>
        </div>
        {selectedTooth ? (
          <ToothDrawer
            toothId={selectedTooth}
            tab={drawerTab}
            payload={displayedPayload}
            baseline={baseline}
            history={history}
            historyLoading={historyLoading}
            historyError={historyError}
            disabled={editingDisabled}
            onTabChange={setDrawerTab}
            onClose={() => setSelectedTooth(null)}
            onCommit={commit}
          />
        ) : null}
      </div>
    </section>
  );
}
