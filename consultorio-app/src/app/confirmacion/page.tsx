"use client";

import { motion } from "motion/react";
import { CheckCircle2, Home, ClipboardList } from "lucide-react";
import { Button } from "@/components/Button";
import { FeedbackState } from "@/components/FeedbackState";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const questionnaireUrl = searchParams.get("cuestionario");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center"
      >
        <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-4">
          ¡Cita agendada con éxito!
        </h1>

        <p className="text-muted-foreground mb-8">
          Tu cita ha sido registrada. En breve recibirás un mensaje de WhatsApp con la confirmación.
          {questionnaireUrl && " Te recomendamos contestar el cuestionario pre-consulta antes de tu cita."}
        </p>

        <div className="space-y-3">
          {questionnaireUrl && (
            <Button
              fullWidth
              size="lg"
              onClick={() => router.push(decodeURIComponent(questionnaireUrl))}
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              Contestar cuestionario pre-consulta
            </Button>
          )}

          <Button
            fullWidth
            size="lg"
            variant="secondary"
            onClick={() => router.push("/")}
          >
            <Home className="w-4 h-4 mr-2" />
            Volver al inicio
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default function BookingConfirmation() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <FeedbackState
              variant="loading"
              title="Cargando confirmación"
              description="Preparando los detalles finales de tu cita."
            />
          </div>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
