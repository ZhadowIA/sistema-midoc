"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, CheckCircle2, Bot } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ── VAD config ────────────────────────────────────────────────────────────────
const VAD_SILENCE_THRESHOLD = 0.012  // RMS below this = silence
const VAD_SILENCE_DURATION_MS = 1800 // silence this long → auto-stop
const VAD_MIN_SPEECH_MS = 600        // must have speech for at least this long before VAD kicks in
const VAD_POLL_INTERVAL_MS = 80      // how often we sample the analyser
const MAX_RECORDING_MS = 60_000      // hard cap per response

type InterviewHistoryItem = { role: "user" | "assistant"; content: string };

type VoiceAiInterviewerProps = {
  token: string;
  onFinished: (params: {
    history: InterviewHistoryItem[];
    summary: string;
    possibleConditions: string[];
    physicalExamChecklist: string[];
  }) => void;
  onAdvanceStep: () => void;
};

type Phase =
  | "idle"          // waiting for first tap
  | "requesting"    // asking mic permission
  | "listening"     // actively recording + VAD
  | "processing"    // sending to backend
  | "speaking"      // showing AI question, waiting for next tap
  | "done";         // isFinished = true

export function VoiceAiInterviewer({ token, onFinished, onAdvanceStep }: VoiceAiInterviewerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentQuestion, setCurrentQuestion] = useState(
    "¡Hola! Toca el micrófono y cuéntame con tus propias palabras qué molestias te traen hoy."
  );
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState<InterviewHistoryItem[]>([]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [silenceProgress, setSilenceProgress] = useState(0); // 0–1 fill for the silence bar

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechStartedRef = useRef(false);
  const silenceSinceRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  const hardCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAll = useCallback(() => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    if (hardCapTimerRef.current) { clearTimeout(hardCapTimerRef.current); hardCapTimerRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => undefined); audioCtxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    analyserRef.current = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const sendAudio = useCallback(
    async (blob: Blob, currentHistory: InterviewHistoryItem[]) => {
      setPhase("processing");
      setError(null);
      try {
        const form = new FormData();
        form.append("audio", blob, "response.webm");
        form.append("history", JSON.stringify(currentHistory));

        const res = await fetch(`/api/clinical/public/questionnaire/${token}/ai-interview`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al procesar la respuesta");

        const userTranscript = (data.transcript as string) || "";
        setTranscript(userTranscript);

        const newHistory: InterviewHistoryItem[] = [
          ...currentHistory,
          { role: "user", content: userTranscript },
          {
            role: "assistant",
            content: data.isFinished
              ? "¡Perfecto! He recolectado toda la información necesaria."
              : (data.question as string),
          },
        ];
        setHistory(newHistory);
        setStep((s) => s + 1);
        onAdvanceStep();

        if (data.isFinished) {
          setPhase("done");
          setTimeout(() => {
            onFinished({
              history: newHistory,
              summary: (data.summary as string) || "",
              possibleConditions: Array.isArray(data.possibleConditions) ? data.possibleConditions : [],
              physicalExamChecklist: Array.isArray(data.physicalExamChecklist) ? data.physicalExamChecklist : [],
            });
          }, 1800);
        } else {
          setCurrentQuestion(data.question as string);
          setPhase("speaking");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error desconocido");
        setPhase("speaking");
      }
    },
    [token, onFinished, onAdvanceStep],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setPhase("requesting");
    chunksRef.current = [];
    speechStartedRef.current = false;
    silenceSinceRef.current = null;
    setSilenceProgress(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setError("No se pudo acceder al micrófono. Verifica los permisos del navegador.");
      setPhase("speaking");
      return;
    }

    streamRef.current = stream;

    // Web Audio for VAD
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;

    // MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stopAll();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      void sendAudio(blob, history);
    };

    recorder.start(200); // collect chunks every 200ms
    recordingStartRef.current = Date.now();
    setPhase("listening");

    // Hard cap
    hardCapTimerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    }, MAX_RECORDING_MS);

    // VAD poll loop
    const dataArr = new Float32Array(analyser.fftSize);
    vadTimerRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(dataArr);
      const rms = Math.sqrt(dataArr.reduce((s, v) => s + v * v, 0) / dataArr.length);
      const elapsed = Date.now() - recordingStartRef.current;
      const isSpeaking = rms > VAD_SILENCE_THRESHOLD;

      if (isSpeaking) {
        if (elapsed >= VAD_MIN_SPEECH_MS) speechStartedRef.current = true;
        silenceSinceRef.current = null;
        setSilenceProgress(0);
      } else if (speechStartedRef.current) {
        if (silenceSinceRef.current === null) silenceSinceRef.current = Date.now();
        const silenceMs = Date.now() - silenceSinceRef.current;
        setSilenceProgress(Math.min(silenceMs / VAD_SILENCE_DURATION_MS, 1));

        if (silenceMs >= VAD_SILENCE_DURATION_MS) {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }
      }
    }, VAD_POLL_INTERVAL_MS);
  }, [history, sendAudio, stopAll]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="flex justify-center">
          <div className="bg-success/10 p-3 rounded-full">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
        </div>
        <p className="font-medium">Entrevista completada.</p>
        <p className="text-sm text-muted-foreground">Preparando tu expediente…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
        La IA solo apoya la recopilación de antecedentes. No emite diagnóstico autónomo.
      </div>

      {/* Question bubble */}
      <div className="bg-primary/5 border border-primary/10 rounded-lg p-6 relative overflow-hidden min-h-[100px] flex items-center justify-center">
        <div className="absolute top-2 right-3">
          <Bot className="w-5 h-5 text-primary/30" />
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={currentQuestion}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-base font-medium text-foreground text-center"
          >
            {currentQuestion}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Mic button area */}
      <div className="flex flex-col items-center gap-4">
        {phase === "listening" && (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                Grabando…
              </span>
              <span>{silenceProgress > 0 ? "Detectando silencio…" : "Escuchando"}</span>
            </div>
            {silenceProgress > 0 && (
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-warning rounded-full"
                  animate={{ width: `${silenceProgress * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}
          </div>
        )}

        <button
          onClick={phase === "listening" ? undefined : startRecording}
          disabled={phase === "requesting" || phase === "processing"}
          className={[
            "w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg",
            phase === "listening"
              ? "bg-destructive text-white scale-110 cursor-default ring-4 ring-destructive/20"
              : phase === "processing" || phase === "requesting"
                ? "bg-secondary text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:scale-105 active:scale-95",
          ].join(" ")}
        >
          {phase === "processing" || phase === "requesting" ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : phase === "listening" ? (
            <Mic className="w-8 h-8" />
          ) : (
            <MicOff className="w-8 h-8" />
          )}
        </button>

        <p className="text-sm text-muted-foreground text-center">
          {phase === "idle" && "Toca el micrófono para empezar a hablar"}
          {phase === "requesting" && "Solicitando permiso de micrófono…"}
          {phase === "listening" && "Habla con calma. El micrófono se detendrá solo al terminar."}
          {phase === "processing" && "Procesando tu respuesta…"}
          {phase === "speaking" && "Toca el micrófono para responder"}
        </p>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {/* Transcript preview */}
        {transcript && (
          <div className="w-full rounded-md border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Tú:</span> {transcript}
          </div>
        )}

        {/* Progress */}
        {step > 0 && (
          <div className="w-full flex items-center gap-2">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    s <= step ? "bg-primary" : "bg-primary/10"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {step < 4 ? `Pregunta ${step} de máx. 4` : "Última pregunta"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
