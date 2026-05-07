"use client";

import { useState } from "react";
import { DollarSign, CreditCard, Banknote, ArrowLeftRight, HelpCircle } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toast } from "sonner";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  /** Pre-fill para el concepto (ej. "Consulta general") */
  defaultConcept?: string;
  /** Callback al completar cobro exitosamente */
  onSuccess: (newStatus: "COMPLETED") => void;
};

const METHOD_OPTIONS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "CASH",     label: "Efectivo",       icon: <Banknote className="w-4 h-4" /> },
  { value: "CARD",     label: "Tarjeta",         icon: <CreditCard className="w-4 h-4" /> },
  { value: "TRANSFER", label: "Transferencia",   icon: <ArrowLeftRight className="w-4 h-4" /> },
  { value: "OTHER",    label: "Otro",            icon: <HelpCircle className="w-4 h-4" /> },
];

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function CobrarModal({ open, onOpenChange, appointmentId, defaultConcept = "Consulta", onSuccess }: Props) {
  const [concept, setConcept]   = useState(defaultConcept);
  const [amount, setAmount]     = useState("");
  const [method, setMethod]     = useState<PaymentMethod>("CASH");
  const [notes, setNotes]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setConcept(defaultConcept);
    setAmount("");
    setMethod("CASH");
    setNotes("");
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const isValid = concept.trim().length > 0 && Number(amount) > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agenda/admin/appointments/${appointmentId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: concept.trim(),
          amount: Number(amount),
          method,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar cobro");
      toast.success("Cobro registrado — consulta completada");
      handleClose(false);
      onSuccess("COMPLETED");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar cobro");
    } finally {
      setSubmitting(false);
    }
  };

  const parsedAmount = Number(amount);

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Registrar cobro"
      description="El cobro queda vinculado a la cita y la marca como completada."
      size="sm"
    >
      <div className="space-y-4">
        {/* Concepto */}
        <Input
          label="Concepto"
          value={concept}
          onChange={e => setConcept(e.target.value)}
          placeholder="Consulta general, procedimiento..."
        />

        {/* Monto */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Monto (MXN)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <DollarSign className="w-4 h-4" />
            </span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {parsedAmount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{mxn.format(parsedAmount)}</p>
          )}
        </div>

        {/* Método de pago */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Método de pago</label>
          <div className="grid grid-cols-2 gap-2">
            {METHOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMethod(opt.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm transition-colors ${
                  method === opt.value
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-background hover:bg-secondary/30 text-foreground"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notas opcionales */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Notas (opcional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Referencia de transferencia, observaciones..."
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {/* Acciones */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="flex-1"
          >
            {submitting ? "Registrando..." : `Cobrar ${parsedAmount > 0 ? mxn.format(parsedAmount) : ""}`}
          </Button>
          <Button variant="secondary" onClick={() => handleClose(false)} disabled={submitting}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
