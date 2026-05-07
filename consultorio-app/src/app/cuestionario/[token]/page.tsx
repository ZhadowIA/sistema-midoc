"use client";

import { useState, useEffect, Suspense, type FormEvent } from "react";
import { use } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send, CheckCircle2, Home, Activity, Thermometer,
  Stethoscope, Droplets, Brain, HeartPulse, ChevronRight, ChevronLeft,
  Bot, Sparkles, Mic
} from "lucide-react";
import { VoiceAiInterviewer } from "@/components/clinical/VoiceAiInterviewer";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";
import { FeedbackState } from "@/components/FeedbackState";
import { useRouter } from "next/navigation";

// --- CONFIGURACIÓN DEL CATÁLOGO ---
const SYMPTOM_CATALOG = [
  { id: "DOLOR", label: "Dolor / Trauma Físico", icon: Activity, color: "text-red-500", bg: "bg-red-50" },
  { id: "RESPIRATORIO", label: "Respiratorio / Gripe", icon: Thermometer, color: "text-blue-500", bg: "bg-blue-50" },
  { id: "DIGESTIVO", label: "Digestivo / Estómago", icon: Droplets, color: "text-orange-500", bg: "bg-orange-50" },
  { id: "URINARIO", label: "Urinario / Vías bajas", icon: Droplets, color: "text-yellow-500", bg: "bg-yellow-50" },
  { id: "CONTROL", label: "Chequeo / Control", icon: HeartPulse, color: "text-green-500", bg: "bg-green-50" },
  { id: "OTRO", label: "Otro / Emocional", icon: Brain, color: "text-purple-500", bg: "bg-purple-50" }
];

const CHRONIC_CONDITIONS = [
  "Ninguna", "Hipertensión", "Diabetes", "Asma", "Tiroides", "Enf. Corazón", "Gastritis/Reflujo"
];

type DynamicAnswerValue = string | number | boolean;
type DynamicAnswerMap = Record<string, DynamicAnswerValue>;
const SELECT_FIELD_CLASSNAME = "w-full p-3 rounded-md border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

function getSymptomLabelById(symptomId: string): string {
  return SYMPTOM_CATALOG.find((item) => item.id === symptomId)?.label || symptomId;
}

function QuestionnaireWizard({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "form" | "success" | "error" | "already">("loading");
  const [aiInterviewTextEnabled, setAiInterviewTextEnabled] = useState(false);
  const [aiInterviewAudioEnabled, setAiInterviewAudioEnabled] = useState(false);
  const [step, setStep] = useState(1);

  // --- ESTADOS DEL FORMULARIO ---
  const [basic, setBasic] = useState({ weight: "", height: "", type: "Primera vez" });
  const [primarySymptom, setPrimarySymptom] = useState("");
  const [secondarySymptom, setSecondarySymptom] = useState("");
  
  // Paso 2 (Dinámico)
  const [duration, setDuration] = useState("");
  const [dynData, setDynData] = useState<DynamicAnswerMap>({});

  const getDynamicKey = (symptomId: string, key: string): string =>
    symptomId === primarySymptom ? key : `${symptomId}__${key}`;

  const getDynamicText = (key: string): string => {
    const value = dynData[key];
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return "";
  };

  const getDynamicNumber = (key: string, fallback: number): number => {
    const value = dynData[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  };

  const getDynamicBool = (key: string): boolean => dynData[key] === true;

  const getDynamicTextBySymptom = (symptomId: string, key: string): string =>
    getDynamicText(getDynamicKey(symptomId, key));

  const getDynamicNumberBySymptom = (symptomId: string, key: string, fallback: number): number =>
    getDynamicNumber(getDynamicKey(symptomId, key), fallback);

  const getDynamicBoolBySymptom = (symptomId: string, key: string): boolean =>
    getDynamicBool(getDynamicKey(symptomId, key));

  const setDynamicValue = (symptomId: string, key: string, value: DynamicAnswerValue) => {
    const dynamicKey = getDynamicKey(symptomId, key);
    setDynData((prev) => ({ ...prev, [dynamicKey]: value }));
  };

  const handleSecondarySymptomChange = (value: string) => {
    if (secondarySymptom && secondarySymptom !== value) {
      const secondaryPrefix = `${secondarySymptom}__`;
      setDynData((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(secondaryPrefix)))
      );
    }

    setSecondarySymptom(value);
  };
  
  const [conditions, setConditions] = useState<string[]>([]);
  const [meds, setMeds] = useState("");
  const [allergies, setAllergies] = useState("");

  // --- ESTADOS DE ENTREVISTA IA ---
  const [aiMode, setAiMode] = useState(false);
  const [voiceAiMode, setVoiceAiMode] = useState(false);
  const [interviewHistory, setInterviewHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [aiStep, setAiStep] = useState(0);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiPossibleConditions, setAiPossibleConditions] = useState<string[]>([]);
  const [aiPhysicalExamChecklist, setAiPhysicalExamChecklist] = useState<string[]>([]);
  const [currentAiQuestion, setCurrentAiQuestion] = useState("¡Hola! Soy tu asistente virtual. Cuéntame con tus propias palabras, ¿qué molestias te traen hoy a la consulta?");

  const startAiInterview = () => {
    setAiMode(true);
    setVoiceAiMode(false);
    setStep(2);
  };

  const startVoiceAiInterview = () => {
    setAiMode(true);
    setVoiceAiMode(true);
    setStep(2);
  };

  useEffect(() => {
    fetch(`/api/clinical/public/questionnaire/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) setStatus("error");
        else if (data.status === "ANSWERED") setStatus("already");
        else {
          setAiInterviewTextEnabled(data?.capabilities?.aiInterviewTextEnabled === true);
          setAiInterviewAudioEnabled(data?.capabilities?.aiInterviewAudioEnabled === true);
          setStatus("form");
        }
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleNext = () => {
    if (step === 1 && !primarySymptom) {
      alert("Por favor selecciona un motivo principal.");
      return;
    }
    if (step === 2 && !duration) {
      alert("Por favor indica hace cuánto iniciaron las molestias.");
      return;
    }
    setStep(s => s + 1);
  };

  const toggleCondition = (cond: string) => {
    if (cond === "Ninguna") {
      setConditions(["Ninguna"]);
      return;
    }
    let newConds = conditions.filter(c => c !== "Ninguna");
    if (newConds.includes(cond)) {
      newConds = newConds.filter(c => c !== cond);
    } else {
      newConds.push(cond);
    }
    setConditions(newConds);
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    try {
      const payload = {
        primarySymptom: aiMode ? "AI_INTERVIEW" : primarySymptom,
        responses: {
          basic,
          duration: aiMode ? "Variante IA" : duration,
          dynamicAnswers: dynData,
          additionalSymptomCategories: secondarySymptom ? [secondarySymptom] : [],
          conditions,
          medications: meds,
          allergies,
          aiInterview: aiMode ? {
            history: interviewHistory,
            summary: aiSummary,
            possibleConditions: aiPossibleConditions,
            physicalExamChecklist: aiPhysicalExamChecklist,
          } : undefined
        }
      };

      const res = await fetch(`/api/clinical/public/questionnaire/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) setStatus("success");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  // --- RENDER CONDICIONAL PASO 2 ---
  const renderDynamicQuestions = (symptomId: string) => {
    switch (symptomId) {
      case "DOLOR":
        return (
          <>
            <Input
              label="¿En qué parte exacta duele?"
              value={getDynamicTextBySymptom(symptomId, "location")}
              onChange={e => setDynamicValue(symptomId, "location", e.target.value)}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Intensidad del dolor (1-10)</label>
              <input type="range" min="1" max="10" className="w-full accent-primary" 
                value={getDynamicNumberBySymptom(symptomId, "intensity", 5)}
                onChange={e => setDynamicValue(symptomId, "intensity", e.target.value)}
              />
              <div className="text-center text-primary font-bold">{getDynamicNumberBySymptom(symptomId, "intensity", 5)}</div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de dolor</label>
              <select
                className={SELECT_FIELD_CLASSNAME}
                value={getDynamicTextBySymptom(symptomId, "type")}
                onChange={e => setDynamicValue(symptomId, "type", e.target.value)}
              >
                <option value="">-- Seleccionar --</option>
                <option>Punzante / Piquetes</option>
                <option>Opresivo (Siente que aprieta)</option>
                <option>Ardor</option>
                <option>Sordo / Constante</option>
                <option>Calambre</option>
              </select>
            </div>
          </>
        );
      case "RESPIRATORIO":
        return (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Marque los síntomas que presenta:</label>
              {[
                { key: "fever", label: "Fiebre" },
                { key: "dryCough", label: "Tos seca" },
                { key: "phlegmCough", label: "Tos con flemas" },
                { key: "shortnessOfBreath", label: "Falta de aire" },
                { key: "bodyAche", label: "Cuerpo cortado" },
                { key: "soreThroat", label: "Dolor de garganta" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-secondary/20">
                  <input
                    type="checkbox"
                    checked={getDynamicBoolBySymptom(symptomId, item.key)}
                    onChange={e => setDynamicValue(symptomId, item.key, e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  {item.label}
                </label>
              ))}
            </div>
            {getDynamicBoolBySymptom(symptomId, "phlegmCough") && (
              <Input
                label="¿De qué color es la flema?"
                value={getDynamicTextBySymptom(symptomId, "phlegmColor")}
                onChange={e => setDynamicValue(symptomId, "phlegmColor", e.target.value)}
              />
            )}
          </>
        );
      case "DIGESTIVO":
        return (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Marque los síntomas:</label>
              {[
                { key: "nauseaVomiting", label: "Náusea o vómito" },
                { key: "diarrhea", label: "Diarrea" },
                { key: "constipation", label: "Estreñimiento" },
                { key: "heartburn", label: "Ardor estomacal" },
                { key: "bloating", label: "Inflamación" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-secondary/20">
                  <input
                    type="checkbox"
                    checked={getDynamicBoolBySymptom(symptomId, item.key)}
                    onChange={e => setDynamicValue(symptomId, item.key, e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  {item.label}
                </label>
              ))}
            </div>
            {getDynamicBoolBySymptom(symptomId, "diarrhea") && (
              <Input
                type="number"
                label="¿Cuántas evacuaciones líquidas por día?"
                value={getDynamicTextBySymptom(symptomId, "diarrheaCount")}
                onChange={e => setDynamicValue(symptomId, "diarrheaCount", e.target.value)}
              />
            )}
          </>
        );
      case "URINARIO":
        return (
          <>
           <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Síntomas urinarios:</label>
              {[
                { key: "urinaryBurning", label: "Ardor al orinar" },
                { key: "frequentUrination", label: "Orina a cada rato (poco)" },
                { key: "bloodInUrine", label: "Sangre en orina" },
                { key: "lowerBackPain", label: "Dolor en la espalda baja" },
                { key: "urinaryFever", label: "Fiebre" },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-secondary/20">
                  <input
                    type="checkbox"
                    checked={getDynamicBoolBySymptom(symptomId, item.key)}
                    onChange={e => setDynamicValue(symptomId, item.key, e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </>
        );
      case "CONTROL":
        return (
          <TextArea
            label="¿Cuáles enfermedades quiere controlar o revisar hoy?"
            placeholder="Ej. Chequeo de diabetes, presión alta..."
            value={getDynamicTextBySymptom(symptomId, "checkup")}
            onChange={e => setDynamicValue(symptomId, "checkup", e.target.value)}
          />
        );
      case "OTRO":
        return (
          <TextArea
            label="Describa brevemente lo que siente"
            value={getDynamicTextBySymptom(symptomId, "desc")}
            onChange={e => setDynamicValue(symptomId, "desc", e.target.value)}
            rows={4}
          />
        );
    }
  };

  // --- COMPONENTE DE ENTREVISTA POR TEXTO ---
  const TextAiInterviewer = () => {
    const [answer, setAnswer] = useState("");

    const handleSendAnswer = async () => {
      if (!answer.trim()) return;
      setIsAiProcessing(true);
      try {
        const res = await fetch(`/api/clinical/public/questionnaire/${token}/ai-interview`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            textAnswer: answer.trim(),
            history: interviewHistory,
          }),
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const newHistory = [
          ...interviewHistory,
          { role: 'user' as const, content: answer.trim() },
          { role: 'assistant' as const, content: data.isFinished ? "¡Perfecto! He recolectado toda la información necesaria." : data.question }
        ];

        setInterviewHistory(newHistory);
        setAnswer("");
        setAiStep(prev => prev + 1);

        if (data.isFinished) {
          setAiSummary(data.summary || "");
          setAiPossibleConditions(Array.isArray(data.possibleConditions) ? data.possibleConditions : []);
          setAiPhysicalExamChecklist(Array.isArray(data.physicalExamChecklist) ? data.physicalExamChecklist : []);
          setTimeout(() => setStep(3), 2500);
        } else {
          setCurrentAiQuestion(data.question);
        }
      } catch (err) {
        console.error("Error procesando respuesta:", err);
        alert(err instanceof Error ? err.message : "No se pudo procesar tu respuesta.");
      } finally {
        setIsAiProcessing(false);
      }
    };

    if (aiSummary) {
      return (
        <div className="text-center py-6 space-y-4">
          <div className="flex justify-center">
            <div className="bg-success/10 p-3 rounded-full">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
          </div>
          <p className="font-medium">Entrevista completada con éxito.</p>
          <p className="text-sm text-muted-foreground">Estamos preparando tus antecedentes...</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          La IA solo apoya la recopilación de antecedentes. No emite diagnóstico autónomo.
        </div>
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3">
            <Bot className="w-5 h-5 text-primary/40" />
          </div>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={currentAiQuestion}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-lg font-medium text-foreground text-center"
            >
              {currentAiQuestion}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-4">
          <TextArea
            label="Tu respuesta"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Escribe aquí lo que sientes o cómo iniciaron tus síntomas..."
            rows={4}
          />
          <Button onClick={handleSendAnswer} disabled={isAiProcessing || !answer.trim()} fullWidth>
            {isAiProcessing ? "IA procesando..." : "Enviar respuesta"}
          </Button>

          {aiStep > 0 && (
            <div className="w-full flex items-center gap-2">
              <div className="flex gap-1 flex-1">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      s <= aiStep ? 'bg-primary' : 'bg-primary/10'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {aiStep < 4 ? `Pregunta ${aiStep} de máx. 4` : 'Última pregunta'}
              </span>
            </div>
          )}
          {interviewHistory.length > 0 && (
            <div className="w-full rounded-md border border-border bg-secondary/20 p-3 space-y-2 max-h-56 overflow-y-auto">
              {interviewHistory.map((item, idx) => (
                <div key={`${idx}-${item.role}`} className="text-sm">
                  <span className="font-semibold">{item.role === "assistant" ? "IA" : "Paciente"}:</span> {item.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const selectedSymptomCategories = Array.from(new Set([primarySymptom, secondarySymptom].filter(Boolean)));

  // --- RENDER MAIN ---
  if (status === "loading") return <FeedbackState variant="loading" title="Cargando cuestionario" description="Validando enlace y preparando formulario." compact />;
  if (status === "already") return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-primary" />
      </div>
      <p className="text-foreground font-medium mb-6">El cuestionario ya ha sido respondido. ¡Gracias!</p>
      <Button onClick={() => router.push("/")} variant="secondary" fullWidth><Home className="w-4 h-4 mr-2" />Volver</Button>
    </div>
  );
  if (status === "error") return <FeedbackState variant="error" title="No se pudo abrir el cuestionario" description="El enlace puede haber expirado o ya no ser válido." compact />;
  if (status === "success") return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
      <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-success" />
      </div>
      <h3 className="text-xl font-semibold mb-2">¡Cuestionario completado!</h3>
      <p className="text-muted-foreground mb-6">Esta información llegará directamente al expediente del doctor.</p>
      <Button onClick={() => router.push("/")} variant="secondary" fullWidth><Home className="w-4 h-4 mr-2" />Finalizar</Button>
    </motion.div>
  );

  return (
    <div className="w-full">
      {/* progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1,2,3].map(i => (
          <div key={i} className={`w-3 h-3 rounded-full transition-colors ${step >= i ? 'bg-primary' : 'bg-primary/20'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="1" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-6">
            <h2 className="text-xl font-semibold text-center mb-6">Paso 1: Motivo Clínico</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Input label="Peso (kg) Aprox." type="number" placeholder="Ej. 70" value={basic.weight} onChange={e => setBasic({...basic, weight: e.target.value})} />
              <Input label="Estatura (cm)" type="number" placeholder="Ej. 170" value={basic.height} onChange={e => setBasic({...basic, height: e.target.value})} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-sm font-semibold text-muted-foreground">¿Cuál es el motivo PRINCIPAL de la consulta?</label>
                <div className="flex gap-2">
                  {aiInterviewAudioEnabled && (
                    <button
                      onClick={startVoiceAiInterview}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      <Mic className="w-3 h-3" />
                      ENTREVISTA IA (VOZ)
                    </button>
                  )}
                  {aiInterviewTextEnabled && (
                    <button
                      onClick={startAiInterview}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      ENTREVISTA IA (TEXTO)
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SYMPTOM_CATALOG.map(item => {
                  const Icon = item.icon;
                  const isSelected = primarySymptom === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (primarySymptom !== item.id) {
                          setPrimarySymptom(item.id);
                          setSecondarySymptom("");
                          setDynData({});
                        }
                      }}
                      className={`flex items-center gap-3 p-4 rounded-md border-2 transition-all text-left ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30 hover:bg-secondary/30'}`}
                    >
                      <div className={`p-2 rounded-lg ${item.bg}`}><Icon className={`w-5 h-5 ${item.color}`} /></div>
                      <span className="font-medium text-sm">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Button fullWidth onClick={handleNext} disabled={!primarySymptom}>Siguiente <ChevronRight className="w-4 h-4 ml-1"/></Button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="2" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-6">
            <h2 className="text-xl font-semibold text-center mb-6">
              {aiMode && voiceAiMode ? "Entrevista por Voz" : aiMode ? "Entrevista Inteligente" : "Paso 2: Detalles del Síntoma"}
            </h2>
            
            {aiMode && voiceAiMode ? (
              <VoiceAiInterviewer
                token={token}
                onAdvanceStep={() => setAiStep((s) => s + 1)}
                onFinished={({ history, summary, possibleConditions, physicalExamChecklist }) => {
                  setInterviewHistory(history);
                  setAiSummary(summary);
                  setAiPossibleConditions(possibleConditions);
                  setAiPhysicalExamChecklist(physicalExamChecklist);
                  setTimeout(() => setStep(3), 1800);
                }}
              />
            ) : aiMode ? (
              <TextAiInterviewer />
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">¿Hace cuánto iniciaron los síntomas?</label>
                  <select className={SELECT_FIELD_CLASSNAME} value={duration} onChange={e => setDuration(e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    <option>Desde hoy</option>
                    <option>Hace 2 o 3 días</option>
                    <option>Hace 1 semana</option>
                    <option>Hace más de un mes</option>
                    <option>Es un problema crónico (Años)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">¿Desea agregar otra categoría de síntomas? (Opcional)</label>
                  <select
                    className={SELECT_FIELD_CLASSNAME}
                    value={secondarySymptom}
                    onChange={e => handleSecondarySymptomChange(e.target.value)}
                  >
                    <option value="">No, solo la categoría principal</option>
                    {SYMPTOM_CATALOG.filter((item) => item.id !== primarySymptom).map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  {selectedSymptomCategories.map((symptomId, index) => (
                    <div key={symptomId} className="rounded-md border border-border/70 bg-secondary/15 p-4 space-y-4">
                      <div className="text-sm font-semibold text-foreground">
                        {index === 0 ? "Categoría principal" : "Categoría adicional"}: {getSymptomLabelById(symptomId)}
                      </div>
                      {renderDynamicQuestions(symptomId)}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="secondary" onClick={() => {
                setStep(1);
                if (aiMode) {
                  setAiMode(false);
                  setVoiceAiMode(false);
                  setInterviewHistory([]);
                  setAiStep(0);
                }
              }}><ChevronLeft className="w-4 h-4 mr-1"/> Atrás</Button>
              {!aiMode && (
                <Button fullWidth onClick={handleNext} disabled={!duration}>Siguiente <ChevronRight className="w-4 h-4 ml-1"/></Button>
              )}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="3" initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-20}} className="space-y-6">
            <h2 className="text-xl font-semibold text-center mb-6">Paso 3: Antecedentes Importantes</h2>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">¿Padece alguna de estas enfermedades?</label>
              <div className="flex flex-wrap gap-2">
                {CHRONIC_CONDITIONS.map(c => {
                  const active = conditions.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCondition(c)}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${active ? 'bg-primary text-white border-primary' : 'bg-background hover:bg-secondary border-border'} ${c === 'Ninguna' && active ? 'bg-success border-success text-white' : ''}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <TextArea label="Medicamentos actuales (Los que toma diario o frecuentemente)" placeholder="Opcional..." value={meds} onChange={e => setMeds(e.target.value)} rows={2} />
            <TextArea label="¿Es alérgico a algún medicamento o alimento?" placeholder="Mencionar alergias conocidas..." value={allergies} onChange={e => setAllergies(e.target.value)} rows={2} />
            {aiMode && (aiPossibleConditions.length > 0 || aiPhysicalExamChecklist.length > 0) && (
              <div className="rounded-md border border-border bg-secondary/10 p-4 space-y-3">
                {aiPossibleConditions.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">Posibles padecimientos orientativos</p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                      {aiPossibleConditions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {aiPhysicalExamChecklist.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">Checklist sugerido de exploración física</p>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground">
                      {aiPhysicalExamChecklist.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button variant="secondary" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1"/> Atrás</Button>
              <Button fullWidth onClick={handleSubmit}>
                <Send className="w-4 h-4 mr-2" />
                Finalizar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QuestionnairePage(props: { params: Promise<{ token: string }> }) {
  const params = use(props.params);
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold text-foreground mb-4">Pre-Consulta Médica</h1>
          <p className="text-muted-foreground text-sm">
            Ayuda a formar tu expediente para tu próxima visita respondiendo este rápido cuestionario. ¡No te tomará más de 2 minutos!
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 sm:p-8 shadow-sm">
          <Suspense fallback={<FeedbackState variant="loading" title="Cargando sistema" compact />}>
            <QuestionnaireWizard token={params.token} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

