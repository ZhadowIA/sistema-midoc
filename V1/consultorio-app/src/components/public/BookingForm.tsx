"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarCheck2 } from "lucide-react";

type Service = {
  id: string;
  name: string;
  price: number;
};

type SelectedSlot = {
  date: string;
  startTime: string;
  endTime: string;
} | null;

interface BookingFormProps {
  isOpen: boolean;
  selectedSlot: SelectedSlot;
  services: Service[];
  onSubmit: (data: {
    name: string;
    email: string;
    phone: string;
    reason?: string;
    serviceId?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function BookingForm({
  isOpen,
  selectedSlot,
  services,
  onSubmit,
  isSubmitting,
}: BookingFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    reason: "",
    serviceId: services[0]?.id || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone: string) => /^[+]?[\d\s-()]+$/.test(phone) && phone.replace(/\D/g, "").length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.email.trim()) newErrors.email = "El email es requerido";
    else if (!validateEmail(formData.email)) newErrors.email = "Email inválido";
    if (!formData.phone.trim()) newErrors.phone = "El teléfono es requerido";
    else if (!validatePhone(formData.phone)) newErrors.phone = "Teléfono inválido";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      reason: formData.reason || undefined,
      serviceId: services.length > 1 ? formData.serviceId : undefined,
    });

    setFormData({ name: "", email: "", phone: "", reason: "", serviceId: services[0]?.id || "" });
  };

  if (!isOpen) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-5 text-center lg:sticky lg:top-6">
        <CalendarCheck2 className="mx-auto mb-3 h-8 w-8 text-primary/70" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Selecciona un horario</p>
        <p className="mt-1 text-sm text-muted-foreground">Después te pediremos los datos para confirmar la cita.</p>
      </div>
    );
  }

  const selectedDate = selectedSlot
    ? new Date(selectedSlot.date)
    : null;

  return (
    <section className="rounded-3xl border border-primary/20 bg-card p-4 shadow-sm sm:p-6 lg:sticky lg:top-6">
      {selectedSlot && selectedDate && (
        <div className="mb-5 rounded-2xl border border-primary/10 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Tu cita</p>
          <p className="mt-1 font-semibold capitalize text-foreground">
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </p>
          <p className="mt-1 text-sm font-semibold text-primary">
            {selectedSlot.startTime} - {selectedSlot.endTime}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Tu nombre"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          placeholder="Juan Pérez"
          error={errors.name}
          disabled={isSubmitting}
        />

        <Input
          label="Correo electrónico"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleInputChange}
          placeholder="juan@example.com"
          error={errors.email}
          disabled={isSubmitting}
        />

        <Input
          label="Teléfono"
          name="phone"
          value={formData.phone}
          onChange={handleInputChange}
          placeholder="+52 1234567890"
          error={errors.phone}
          disabled={isSubmitting}
        />

        {services.length > 1 && (
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
              Tipo de consulta
            </label>
            <select
              name="serviceId"
              value={formData.serviceId}
              onChange={handleInputChange}
              disabled={isSubmitting}
              className="min-h-11 w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - ${service.price.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        )}

        <TextArea
          label="Motivo de la cita (opcional)"
          name="reason"
          value={formData.reason}
          onChange={handleInputChange}
          placeholder="Cuéntale al doctor por qué solicitas la cita..."
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          fullWidth
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Agendar cita
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          El consultorio confirmará tu cita por WhatsApp.
        </p>
      </form>
    </section>
  );
}
