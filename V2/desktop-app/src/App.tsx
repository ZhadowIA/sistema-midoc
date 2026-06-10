import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface UnlockResult {
  schema_version: number;
  db_path: string;
}

function App() {
  const [passphrase, setPassphrase] = useState("");
  const [unlocked, setUnlocked] = useState<UnlockResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const result = await invoke<UnlockResult>("unlock_database", {
        passphrase,
      });
      setUnlocked(result);
      setPassphrase("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    await invoke("lock_database");
    setUnlocked(null);
  }

  if (unlocked) {
    return (
      <main className="container">
        <h1>MiDoc</h1>
        <p>Expediente desbloqueado.</p>
        <p className="meta">
          Esquema v{unlocked.schema_version} · {unlocked.db_path}
        </p>
        <button onClick={lock}>Bloquear</button>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>MiDoc</h1>
      <p>Introduce tu frase de seguridad para abrir el expediente cifrado.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.currentTarget.value)}
          placeholder="Frase de seguridad"
          autoFocus
        />
        <button type="submit" disabled={busy || passphrase.length === 0}>
          {busy ? "Abriendo…" : "Desbloquear"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}

export default App;
