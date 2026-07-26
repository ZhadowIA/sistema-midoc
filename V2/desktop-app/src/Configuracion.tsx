import { useMemo, useState } from "react";
import { Arco } from "./Arco";
import { Benchmark } from "./Benchmark";
import { MedicationReference } from "./MedicationReference";
import { TranscriptionSetup } from "./TranscriptionSetup";
import {
  configuracionSections,
  resolveConfiguracionSection,
  type ConfiguracionSectionId
} from "./configuracionSections";
import { nextTheme, themeToggleLabel, type Theme } from "./theme";

/**
 * Configuración de la Estación Clínica: un único destino del menú lateral que
 * reúne el tema, los servicios y precios (que se editan en el portal) y las
 * herramientas de soporte —transcripción, referencia de medicamentos, ARCO y el
 * banco de pruebas de IA—. Ninguna de estas pantallas es trabajo clínico diario,
 * así que salen de la navegación principal y de la barra superior.
 */

interface ConfiguracionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  // Sin URL de portal no se puede abrir el panel de servicios y precios.
  portalUrl: string | null;
  onOpenServicios: () => void;
}

export function Configuracion({
  theme,
  onThemeChange,
  portalUrl,
  onOpenServicios
}: ConfiguracionProps) {
  const sections = useMemo(
    () => configuracionSections({ canOpenPortal: Boolean(portalUrl) }),
    [portalUrl]
  );
  const [requestedSection, setRequestedSection] = useState<ConfiguracionSectionId>("apariencia");
  const activeSection = resolveConfiguracionSection(requestedSection, sections);
  const activeMeta = sections.find((section) => section.id === activeSection);

  return (
    // Sin tarjeta exterior: la configuración ES la página, y envolverla en un
    // recuadro solo añade un borde que compite con el de cada ajuste.
    <section className="panel-plain configuracion-panel">
      <div className="page-heading">
        <div>
          <h1>Configuración</h1>
          <p>{activeMeta?.description ?? "Ajustes de esta computadora."}</p>
        </div>
      </div>

      <div className="tab-row configuracion-tabs" role="tablist" aria-label="Secciones de configuración">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            id={`configuracion-tab-${section.id}`}
            aria-selected={activeSection === section.id}
            aria-controls={`configuracion-panel-${section.id}`}
            className={activeSection === section.id ? "tab tab-active" : "tab"}
            onClick={() => setRequestedSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`configuracion-panel-${activeSection}`}
        aria-labelledby={`configuracion-tab-${activeSection}`}
        className="configuracion-section"
      >
        {activeSection === "apariencia" ? (
          <div className="configuracion-block">
            <div className="configuracion-block-text">
              <strong>Tema de la aplicación</strong>
              <p className="meta">
                {theme === "night"
                  ? "Cobalto nocturno: para consultorios con poca luz y jornadas largas."
                  : "Tema claro: el predeterminado para luz de día."}{" "}
                Es una preferencia de esta computadora; no viaja con tu expediente.
              </p>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => onThemeChange(nextTheme(theme))}
              aria-pressed={theme === "night"}
            >
              {themeToggleLabel(theme)}
            </button>
          </div>
        ) : activeSection === "servicios" ? (
          <div className="configuracion-block">
            <div className="configuracion-block-text">
              <strong>Servicios, precios y preconsulta</strong>
              <p className="meta">
                Tu oferta comercial vive en el portal, junto con tu perfil público y tu
                agenda en línea. Se abre en tu navegador para no duplicar esa
                configuración aquí.
              </p>
            </div>
            <button className="action-button" type="button" onClick={onOpenServicios}>
              Abrir en el portal
            </button>
          </div>
        ) : activeSection === "transcripcion" ? (
          <TranscriptionSetup />
        ) : activeSection === "medicamentos" ? (
          <MedicationReference />
        ) : activeSection === "arco" ? (
          <Arco />
        ) : (
          <Benchmark />
        )}
      </div>
    </section>
  );
}
