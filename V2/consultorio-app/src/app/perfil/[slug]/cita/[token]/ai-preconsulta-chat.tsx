"use client";

import { useState } from "react";

import { sealEnvelope } from "../../../../../lib/seal-envelope";

type AiPreconsultaChatProps = {
  token: string;
  /** Llave publica del dispositivo del medico para sellar (sealed box). */
  publicKey: string;
  /** Motivo de consulta capturado al agendar (puede ir vacio). */
  initialMotivo: string;
  onSaved: () => void;
};

type Turn = { question: string; answer: string };

type NextQuestion = { type: "question"; question: string } | { type: "done" };

// Marca del sobre sellado para distinguir el resultado de la IA de los
// antecedentes; la app del medico la lee del meta al descifrar.
const AI_PRECONSULTA_ENVELOPE_KIND = "ai-preconsulta";

export function AiPreconsultaChat({ token, publicKey, initialMotivo, onSaved }: AiPreconsultaChatProps) {
  const [consented, setConsented] = useState(false);
  const [motivo, setMotivo] = useState(initialMotivo);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");

  async function askNext(currentTurns: Turn[]): Promise<void> {
    setBusy(true);
    setBusyLabel(currentTurns.length === 0 ? "Preparando la primera pregunta" : "Preparando la siguiente pregunta");
    setError("");
    try {
      const response = await fetch(`/api/public/appointments/${token}/preconsulta-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, motivo, answers: currentTurns })
      });
      const data = (await response.json()) as NextQuestion & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo continuar la preconsulta.");
      }
      if (data.type === "done") {
        await sealAndSubmit(currentTurns);
        return;
      }
      setQuestion(data.question);
      setAnswer("");
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "No se pudo continuar la preconsulta.");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function sealAndSubmit(finalTurns: Turn[]): Promise<void> {
    setBusy(true);
    setBusyLabel("Cifrando y enviando la preconsulta");
    setError("");
    try {
      const result = { motivo, conversation: finalTurns };
      const body = new TextEncoder().encode(JSON.stringify(result));
      const ciphertext = await sealEnvelope(publicKey, { kind: AI_PRECONSULTA_ENVELOPE_KIND }, body);

      const response = await fetch(`/api/public/appointments/${token}/preconsulta-ai/submit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciphertext })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No fue posible guardar la preconsulta.");
      }
      setQuestion(null);
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No fue posible guardar la preconsulta.");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  function start() {
    setConsented(true);
    void askNext([]);
  }

  function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question || !answer.trim()) {
      return;
    }
    const nextTurns = [...turns, { question, answer: answer.trim() }];
    setTurns(nextTurns);
    setQuestion(null);
    setAnswer("");
    void askNext(nextTurns);
  }

  if (!consented) {
    return (
      <div className="ai-preconsulta-consent">
        <p className="field-hint">
          Esta preconsulta usa inteligencia artificial para hacerte unas preguntas y preparar tu
          consulta. Tus respuestas se cifran en este dispositivo y solo tu médico las lee; no se
          guardan en nuestros servidores. Es opcional.
        </p>
        <label className="field field-full">
          <span>Motivo de tu consulta (opcional)</span>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <button className="action-button" type="button" onClick={start}>
          Acepto y comenzar
        </button>
      </div>
    );
  }

  return (
    <div className="ai-preconsulta-chat">
      {turns.length > 0 ? (
        <ul className="ai-preconsulta-history">
          {turns.map((turn, index) => (
            <li key={index}>
              <p className="ai-q">{turn.question}</p>
              <p className="ai-a">{turn.answer}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {busy && !question ? (
        <div className="ai-preconsulta-thinking" role="status" aria-live="polite">
          <span className="ai-thinking-dot" aria-hidden="true" />
          <span className="ai-thinking-dot" aria-hidden="true" />
          <span className="ai-thinking-dot" aria-hidden="true" />
          <span>{busyLabel || "Preparando la siguiente pregunta"}</span>
        </div>
      ) : null}

      {question ? (
        <form className="booking-form" onSubmit={submitAnswer}>
          <label className="field field-full">
            <span>{question}</span>
            <textarea
              rows={2}
              value={answer}
              disabled={busy}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </label>
          <button className="action-button" type="submit" disabled={busy || !answer.trim()}>
            {busy ? "Enviando…" : "Responder"}
          </button>
        </form>
      ) : error && !busy ? (
        <button className="ghost-button" type="button" onClick={() => void askNext(turns)}>
          Intentar de nuevo
        </button>
      ) : (
        <p className="field-hint" />
      )}
    </div>
  );
}
