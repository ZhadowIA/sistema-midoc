"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Radio } from "lucide-react";
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

type DeepgramAlternative = {
  transcript: string;
  words?: Array<{ word: string; speaker?: number; start?: number; end?: number; punctuated_word?: string }>;
};

type DeepgramMessage = {
  type?: string;
  channel?: { alternatives?: DeepgramAlternative[] };
  is_final?: boolean;
  speech_final?: boolean;
};

type TranscriptSegment = {
  id: number;
  speaker: number | null;
  text: string;
};

type Props = {
  appointmentId: string;
  disabled?: boolean;
  onSoapGenerated: (soap: SoapPartial) => void;
  onEncounterGenerated?: (encounter: EncounterPartial) => void;
};

const DG_URL =
  "wss://api.deepgram.com/v1/listen" +
  "?model=nova-3-general" +
  "&language=multi" +
  "&diarize=true" +
  "&smart_format=true" +
  "&punctuate=true" +
  "&interim_results=true" +
  "&endpointing=500" +
  "&vad_events=true" +
  "&encoding=opus";

function labelForSpeaker(speaker: number | null, firstSpeaker: number | null): string {
  if (speaker === null) return "";
  if (firstSpeaker === null) return `Hablante ${speaker + 1}`;
  return speaker === firstSpeaker ? "Doctor" : "Paciente";
}

function renderTranscriptForAi(segments: TranscriptSegment[], firstSpeaker: number | null): string {
  if (!segments.length) return "";
  return segments
    .map((s) => {
      const tag =
        s.speaker === null
          ? ""
          : firstSpeaker !== null && s.speaker === firstSpeaker
            ? "[Doctor]: "
            : firstSpeaker !== null
              ? "[Paciente]: "
              : `[Hablante ${s.speaker + 1}]: `;
      return `${tag}${s.text.trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function DictationPanel({
  appointmentId,
  disabled,
  onSoapGenerated,
  onEncounterGenerated,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [lastFailedAt, setLastFailedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const segIdRef = useRef(0);
  const firstSpeakerRef = useRef<number | null>(null);
  const segmentsRef = useRef<TranscriptSegment[]>([]);

  const cleanupStream = useCallback(() => {
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (sseRef.current) sseRef.current.close();
      if (wsRef.current && wsRef.current.readyState <= 1) wsRef.current.close();
      cleanupStream();
    };
  }, [cleanupStream]);

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
          setRetrying(false);
          setLastError(null);
          setLastFailedAt(null);
          setLastGeneratedAt(new Date().toISOString());
          toast.success("Nota y encuentro generados con IA. Revisa antes de firmar.");
          src.close();
          sseRef.current = null;
        }
        if (data.status === "FAILED") {
          setGenerating(false);
          setRetrying(false);
          setLastFailedAt(new Date().toISOString());
          setLastError(data.errorMessage ?? "No se pudo generar la nota.");
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

  const sendTranscriptToAi = useCallback(async () => {
    const text = renderTranscriptForAi(segmentsRef.current, firstSpeakerRef.current);
    if (!text.trim()) {
      toast.warning("No se capturó transcripción. Inicia de nuevo la grabación.");
      return;
    }
    setGenerating(true);
    setProgress(10);
    setStatusMsg("Enviando transcripción a la IA...");
    try {
      const res = await fetch(
        `/api/admin/appointments/${appointmentId}/note/generate-from-transcript`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error enviando transcripción");
      if (data.jobId) subscribe(data.jobId);
    } catch (e) {
      setGenerating(false);
      setRetrying(false);
      setProgress(0);
      setStatusMsg("");
      const message = e instanceof Error ? e.message : "Error procesando transcripción";
      setLastFailedAt(new Date().toISOString());
      setLastError(message);
      toast.error(message);
    }
  }, [appointmentId, subscribe]);

  const retryGeneration = useCallback(() => {
    if (generating || retrying) return;
    setRetrying(true);
    setLastError(null);
    setStatusMsg("Reintentando generación...");
    void sendTranscriptToAi();
  }, [generating, retrying, sendTranscriptToAi]);

  const handleDeepgramMessage = useCallback((raw: string) => {
    let msg: DeepgramMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type && msg.type !== "Results") return;
    const alt = msg.channel?.alternatives?.[0];
    if (!alt) return;
    const text = alt.transcript?.trim() ?? "";
    if (!text) {
      if (!msg.is_final) setInterim("");
      return;
    }

    if (!msg.is_final) {
      setInterim(text);
      return;
    }

    const words = alt.words ?? [];
    const speaker = words.length && typeof words[0].speaker === "number" ? words[0].speaker! : null;
    if (firstSpeakerRef.current === null && speaker !== null) {
      firstSpeakerRef.current = speaker;
    }

    setSegments((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const merged: TranscriptSegment = { ...last, text: `${last.text} ${text}`.trim() };
        const next = [...prev.slice(0, -1), merged];
        segmentsRef.current = next;
        return next;
      }
      segIdRef.current += 1;
      const next = [...prev, { id: segIdRef.current, speaker, text }];
      segmentsRef.current = next;
      return next;
    });
    setInterim("");
  }, []);

  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setAudioLevel(Math.min(1, rms * 2.5));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // level meter is decorative; ignore failures
    }
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador no soporta grabación.");
      return;
    }
    setConnecting(true);
    try {
      await fetch(`/api/clinical/admin/appointments/${appointmentId}/consent`, {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);

      const tokenRes = await fetch(
        `/api/admin/appointments/${appointmentId}/transcription/token`,
        { method: "POST", credentials: "include" },
      );
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error ?? "No se pudo obtener credencial");
      const apiKey: string = tokenData.apiKey;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      startLevelMeter(stream);

      const mime =
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRef.current = rec;

      const ws = new WebSocket(DG_URL, ["token", apiKey]);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setConnecting(false);
        setRecording(true);
        setSeconds(0);
        setSegments([]);
        segmentsRef.current = [];
        firstSpeakerRef.current = null;
        setInterim("");
        rec.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then((buf) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(buf);
            });
          }
        };
        rec.start(250);
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        toast.info("Grabando. El sistema está escuchando en vivo.");
      };

      ws.onmessage = (e) => {
        if (typeof e.data === "string") handleDeepgramMessage(e.data);
      };

      ws.onerror = () => {
        toast.error("Conexión de transcripción interrumpida.");
      };

      ws.onclose = (e) => {
        if (e.code !== 1000 && recording) {
          toast.warning("La transcripción se cerró. Detén y vuelve a iniciar si es necesario.");
        }
      };
    } catch (e) {
      setConnecting(false);
      cleanupStream();
      toast.error(e instanceof Error ? e.message : "No se pudo iniciar la grabación.");
    }
  }, [appointmentId, handleDeepgramMessage, startLevelMeter, cleanupStream, recording]);

  const stop = useCallback(() => {
    if (!recording) return;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    const pendingInterim = interim.trim();
    if (pendingInterim) {
      segIdRef.current += 1;
      const next = [
        ...segmentsRef.current,
        { id: segIdRef.current, speaker: null, text: pendingInterim },
      ];
      segmentsRef.current = next;
      setSegments(next);
      setInterim("");
    }
    try {
      mediaRef.current?.stop();
    } catch {
      // ignore
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "CloseStream" }));
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (ws.readyState <= 1) ws.close(1000);
        void sendTranscriptToAi();
      }, 1200);
    } else {
      void sendTranscriptToAi();
    }
    cleanupStream();
  }, [recording, cleanupStream, sendTranscriptToAi, interim]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const hasTranscript = segments.length > 0 || interim.length > 0;

  const bars = Array.from({ length: 16 }, (_, i) => {
    const phase = (i / 16) * Math.PI * 2;
    const base = 20 + audioLevel * 80;
    const wobble = Math.sin(phase + seconds) * 10;
    return Math.max(8, Math.min(100, base + wobble));
  });

  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-2">
            Dictado asistido por IA
            {recording && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                </span>
                EN VIVO
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Transcribe en tiempo real con diarización (Deepgram). Al detener, la IA estructurará SOAP y encuentro.
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
            disabled={disabled || generating || connecting}
            title={disabled ? "Requiere consentimiento del paciente" : undefined}
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Conectando...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" /> Iniciar grabación
              </>
            )}
          </Button>
        )}
      </div>

      {recording && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full bg-destructive/20 animate-ping"
                style={{ animationDuration: "1.4s" }}
              />
              <span
                className="absolute inset-1 rounded-full bg-destructive/30"
                style={{
                  transform: `scale(${1 + audioLevel * 0.6})`,
                  transition: "transform 80ms linear",
                }}
              />
              <Mic className="relative h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 flex items-end gap-0.5 h-10">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-destructive/70"
                  style={{
                    height: `${h}%`,
                    transition: "height 80ms ease-out",
                  }}
                />
              ))}
            </div>
            <div className="text-right text-xs text-muted-foreground tabular-nums">
              <div className="font-mono text-base text-foreground">{mmss}</div>
              <div className="flex items-center gap-1 justify-end">
                <Radio className="w-3 h-3" /> escuchando
              </div>
            </div>
          </div>
        </div>
      )}

      {(recording || hasTranscript) && (
        <div className="rounded-lg border border-border bg-background p-3 max-h-60 overflow-y-auto text-sm space-y-2">
          {segments.length === 0 && !interim && (
            <p className="text-xs text-muted-foreground italic">
              Esperando la primera intervención...
            </p>
          )}
          {segments.map((s) => (
            <p key={s.id} className="leading-relaxed">
              {s.speaker !== null && (
                <span className="font-semibold text-primary mr-1">
                  {labelForSpeaker(s.speaker, firstSpeakerRef.current)}:
                </span>
              )}
              <span>{s.text}</span>
            </p>
          ))}
          {interim && (
            <p className="leading-relaxed text-muted-foreground italic">{interim}</p>
          )}
        </div>
      )}

      {generating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{statusMsg || "Procesando..."}</span>
          <span className="ml-auto text-xs">{progress}%</span>
        </div>
      )}

      {!generating && (lastGeneratedAt || lastFailedAt) && (
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs space-y-2">
          {lastGeneratedAt && (
            <p className="text-emerald-700">
              Última nota generada: {new Date(lastGeneratedAt).toLocaleTimeString()}
            </p>
          )}
          {lastFailedAt && lastError && (
            <p className="text-destructive">
              Último fallo ({new Date(lastFailedAt).toLocaleTimeString()}): {lastError}
            </p>
          )}
          {lastFailedAt && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={retryGeneration}
                disabled={disabled || !hasTranscript || retrying}
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Reintentando...
                  </>
                ) : (
                  "Reintentar generación"
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
