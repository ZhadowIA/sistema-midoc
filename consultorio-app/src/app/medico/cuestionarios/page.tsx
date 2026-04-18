"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, ChevronDown, ChevronUp, User, Clock, MapPin, AlertCircle, Sparkles } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Card, CardContent } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { FeedbackState } from "@/components/FeedbackState";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface QuestionnaireEntry {
  id: string;
  patientName: string;
  patientPhone: string;
  date: string;
  appointmentType: string;
  questionnaire: {
    symptomsText: string;
    symptomDuration: string;
    painLocation: string;
    answeredAt: string;
    isAI?: boolean;
  } | null;
}

export default function DoctorQuestionnaires() {
  const [entries, setEntries] = useState<QuestionnaireEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clinical/admin/questionnaires")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setEntries(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Cuestionarios Pre-Consulta</h1>
              <p className="text-muted-foreground">Respuestas enviadas por los pacientes antes de su cita</p>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <FeedbackState
            variant="loading"
            title="Cargando cuestionarios"
            description="Estamos obteniendo respuestas recientes de pacientes."
          />
        ) : entries.length === 0 ? (
          <Card>
            <CardContent>
              <FeedbackState
                variant="empty"
                title="No hay cuestionarios respondidos aún"
                description="Cuando un paciente responda su cuestionario pre-consulta, aparecerá aquí."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, index) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="overflow-hidden">
                  <div
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-5 cursor-pointer hover:bg-secondary/30 transition-colors"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{entry.patientName}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(entry.date), "EEE dd MMM yyyy · HH:mm", { locale: es })} · {entry.patientPhone}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.questionnaire?.isAI && (
                        <Badge className="text-[10px] bg-primary/20 text-primary border-primary/20">
                          <Sparkles className="w-3 h-3 mr-1" /> IA
                        </Badge>
                      )}
                      <Badge variant="success" className="text-xs">Respondido</Badge>
                      {expandedId === entry.id ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedId === entry.id && entry.questionnaire && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 border-t border-border">
                          <div className="grid gap-5 pt-5">
                            <div className={`rounded-xl p-4 ${entry.questionnaire.isAI ? "bg-primary/5 border border-primary/10" : "bg-secondary/30"}`}>
                              <div className="flex items-center gap-2 mb-2">
                                {entry.questionnaire.isAI ? <Sparkles className="w-4 h-4 text-primary" /> : <AlertCircle className="w-4 h-4 text-primary" />}
                                <span className="text-sm font-semibold text-foreground">
                                  {entry.questionnaire.isAI ? "Resumen de Entrevista IA" : "Síntomas principales"}
                                </span>
                              </div>
                              <p className="text-foreground leading-relaxed whitespace-pre-line">{entry.questionnaire.symptomsText}</p>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="bg-secondary/30 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Clock className="w-4 h-4 text-warning" />
                                  <span className="text-sm font-semibold text-foreground">Duración de los síntomas</span>
                                </div>
                                <p className="text-foreground">{entry.questionnaire.symptomDuration}</p>
                              </div>

                              <div className="bg-secondary/30 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <MapPin className="w-4 h-4 text-destructive" />
                                  <span className="text-sm font-semibold text-foreground">Ubicación del dolor</span>
                                </div>
                                <p className="text-foreground">{entry.questionnaire.painLocation || "No especificado"}</p>
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground text-right">
                              Respondido el {format(new Date(entry.questionnaire.answeredAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </DoctorLayout>
  );
}

