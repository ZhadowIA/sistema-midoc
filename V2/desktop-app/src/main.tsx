import React from "react";
import ReactDOM from "react-dom/client";
import { THEME_STORAGE_KEY, isNightTheme } from "./theme";

// Aplica el tema guardado antes del primer render para evitar un parpadeo
// claro→oscuro al abrir la app.
function applyStoredTheme() {
  try {
    if (isNightTheme(localStorage.getItem(THEME_STORAGE_KEY))) {
      document.documentElement.classList.add("night");
    }
  } catch {
    // localStorage no disponible: se queda en tema claro por defecto.
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ""}`.trim();
  }
  return String(error);
}

function showStartupError(error: unknown) {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  root.replaceChildren();
  const shell = document.createElement("main");
  shell.style.cssText =
    "min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;color:#1f2937;background:#fff;";
  const panel = document.createElement("section");
  panel.style.cssText =
    "width:min(720px,100%);border:1px solid #e5e7eb;border-radius:10px;padding:20px;display:grid;gap:12px;";
  const title = document.createElement("h1");
  title.style.cssText = "margin:0;font-size:20px;";
  title.textContent = "MiDoc no pudo iniciar";
  const body = document.createElement("pre");
  body.style.cssText =
    "margin:0;white-space:pre-wrap;overflow:auto;color:#b91c1c;background:#fef2f2;border-radius:6px;padding:12px;font-size:13px;";
  body.textContent = errorMessage(error);
  panel.append(title, body);
  shell.append(panel);
  root.append(shell);
}

class StartupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    if (this.state.error) {
      showStartupError(this.state.error);
      return null;
    }
    return this.props.children;
  }
}

window.addEventListener("error", (event) => showStartupError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => showStartupError(event.reason));

async function bootstrap() {
  try {
    applyStoredTheme();
    const { default: App } = await import("./App");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <StartupErrorBoundary>
          <App />
        </StartupErrorBoundary>
      </React.StrictMode>,
    );
  } catch (error) {
    showStartupError(error);
  }
}

void bootstrap();
