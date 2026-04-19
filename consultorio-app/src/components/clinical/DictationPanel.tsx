"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";

type SoapPartial = {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
};

export type EncounterPartial = Record<string, unknown>;

type GenerationEvent = {
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progressPct?: number;
  statusMessage?: string | null;
  resultPayload?: { soap?: SoapPartial; encounter?: EncounterPartial } | null;
  errorMessage?: string | null;
};

type Props = {
  appointmentId: string;
  disabled?: boolean;
  onSoapGenerated: (soap: SoapPartial) => void;
  onEncounterGenerated?: (encounter: EncounterPartial) => void;
};

export function DictationPanel({
  appointmentId,
  disabled,
  onSoapGenerated,
  onEncounterGenerated,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (sseRef.current) sseRef.current.close();
      mediaRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const subscribe = useCallback(
    (jobId: string) => {
      if (sseRef.current) sseRef.current.close();
      const src = new EventSource(
        `/api/clinical/admin/appointments/${appointmentId}/note/generate/events?jobId=${jobId}`,
      );
      sseRef.current = src;
      src.addEventListener("status", (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as GenerationEvent;
        setProgress(data.progressPct ?? 0);
        setStatusMsg(data.statusMessage ?? "");
        if (data.status === "COMPLETED") {
          if (data.resultPayload?.soap) onSoapGenerated(data.resultPayload.soap);
          if (data.resultPayload?.encounter && onEncounterGenerated) {
            onEncounterGenerated(data.resultPayload.encounter);
          }
          setGenerating(false);
          toast.success("Nota y encuentro generados con IA. Revisa antes de firmar.");
          src.close();
          sseRef.current = null;
        }
        if (data.status === "FAILED") {
          setGenerating(false);
          toast.error(data.errorMessage ?? "No se pudo generar la nota.");
          src.close();
          sseRef.current = null;
        }
      });
      src.onerror = () => {
        if (sseRef.current !== src) return;
        src.close();
        sseRef.current = null;
      };
    },
    [appointmentId, onSoapGenerated, onEncounterGenerated],
  );

  const uploadAudio = useCallback(
    async (blob: Blob) => {
      setGenerating(true);
      setProgress(10);
      setStatusMsg("Subiendo audio...");
      const form = new FormData();
      form.append("audio", blob, `consulta-${appointmentId}.webm`);
      try {
        const res = await fetch(
          `/api/clinical/admin/appointments/${appointmentId}/note/generate`,
          { method: "POST", credentials: "include", body: form },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error procesando audio");
        if (data.jobId) subscribe(data.jobId);
      } catch (e) {
        setGenerating(false);
        setProgress(0);
        setStatusMsg("");
        toast.error(e instanceof Error ? e.message : "Error procesando audio");
      }
    },
    [appointmentId, subscribe],
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador no soporta grabación.");
      return;
    }
    try {
      await fetch(`/api/clinical/admin/appointments/${appointmentId}/consent`, {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        void uploadAudio(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      toast.info("Grabación iniciada. Consentimiento verbal registrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo acceder al micrófono.");
    }
  };

  const stop = () => {
    if (mediaRef.current && recording) {
      mediaRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Dictado asistido por IA</p>
          <p className="text-xs text-muted-foreground">
            Graba la consulta y la IA prellenará el SOAP y las secciones del encuentro.
            Revisa siempre antes de firmar.
          </p>
        </div>
        {recording ? (
          <Button onClick={stop} variant="destructive" size="sm">
            <Square className="w-4 h-4" /> Detener {mmss}
          </Button>
        ) : (
          <Button
            onClick={start}
            size="sm"
            disabled={disabled || generating}
            title={disabled ? "Requiere consentimiento del paciente" : undefined}
          >
            <Mic className="w-4 h-4" /> Iniciar grabación
          </Button>
        )}
      </div>
      {generating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{statusMsg || "Procesando..."}</span>
          <span className="ml-auto text-xs">{progress}%</span>
        </div>
      )}
    </div>
  );
}
