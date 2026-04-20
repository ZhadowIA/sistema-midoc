"use client";

import { Card, CardContent } from "@/components/Card";
import { Button } from "@/components/Button";
import { Printer, MessageCircle, Calendar, ShieldCheck } from "lucide-react";
import { buildWhatsAppLink, buildPatientMessage } from "./signoffSummaryUtils";

type Props = {
  patientName: string;
  patientPhone?: string | null;
  signedAt: string;
  signatureHash: string | null;
  chiefComplaint: string;
  assessmentSummary: string;
  onBackToAgenda: () => void;
};

export function SignoffSummary({
  patientName,
  patientPhone,
  signedAt,
  signatureHash,
  chiefComplaint,
  assessmentSummary,
  onBackToAgenda,
}: Props) {
  const waLink = patientPhone
    ? buildWhatsAppLink(
        patientPhone,
        buildPatientMessage({ patientName, signedAt, assessmentSummary }),
      )
    : null;
  const shortHash = signatureHash ? `${signatureHash.slice(0, 12)}…` : "—";

  return (
    <Card className="border-emerald-200 bg-emerald-50/50 print:border-black print:bg-white">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <div>
              <p className="font-semibold text-emerald-900">
                Consulta firmada y cerrada
              </p>
              <p className="text-xs text-emerald-800 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(signedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Hash de firma</p>
            <p
              className="font-mono text-[11px] text-emerald-900"
              title={signatureHash ?? undefined}
            >
              {shortHash}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Paciente</p>
            <p className="font-medium">{patientName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Motivo</p>
            <p className="font-medium">{chiefComplaint || "—"}</p>
          </div>
          {assessmentSummary && (
            <div className="md:col-span-2">
              <p className="text-xs text-muted-foreground">Impresión</p>
              <p className="whitespace-pre-line">{assessmentSummary}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
          {waLink ? (
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
              </Button>
            </a>
          ) : (
            <Button
              variant="secondary"
              disabled
              title="El paciente no tiene teléfono registrado"
            >
              <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
            </Button>
          )}
          <Button onClick={onBackToAgenda}>Volver a la agenda</Button>
        </div>
      </CardContent>
    </Card>
  );
}

