"use client";

import { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar as CalendarIcon, Clock, User, CheckCircle2, ArrowLeft, FileText, Lock, LogIn } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { FeedbackState } from "@/components/FeedbackState";
import { Input } from "@/components/Input";
import { RadioGroup } from "@/components/RadioGroup";
import { Select } from "@/components/Select";
import { TimeSlot } from "@/components/TimeSlot";
import { useSearchParams, useRouter } from "next/navigation";
import { format, addDays, addMonths, startOfMonth, startOfToday } from "date-fns";
import { es } from "date-fns/locale";
import { parseFullName } from "@/lib/patientName";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY || "";

const SEX_OPTIONS = [
  { value: "HOMBRE", label: "Hombre" },
  { value: "MUJER", label: "Mujer" },
  { value: "INTERSEXUAL", label: "Intersexual" },
];

const GENDER_OPTIONS = [
  { value: "NOT_SPECIFIED", label: "No especificado" },
  { value: "MASCULINE", label: "Masculino" },
  { value: "FEMININE", label: "Femenino" },
  { value: "TRANSGENDER", label: "Transgénero" },
  { value: "TRANSSEXUAL", label: "Transexual" },
  { value: "TRAVESTI", label: "Travesti" },
  { value: "INTERSEX", label: "Intersexual" },
  { value: "OTHER", label: "Otro" },
];

const RELATION_OPTIONS = [
  { value: "SELF", label: "El paciente mismo" },
  { value: "PARENT", label: "Padre / Madre" },
  { value: "SPOUSE", label: "Cónyuge / Pareja" },
  { value: "SIBLING", label: "Hermano(a)" },
  { value: "CHILD", label: "Hijo(a)" },
  { value: "OTHER", label: "Otro" },
];

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

type Step = "auth" | "doctor" | "type" | "date" | "time" | "info" | "confirm";

type PatientAuthProfile = {
  id: string;
  firstName?: string | null;
  lastNamePaternal?: string | null;
  lastNameMaternal?: string | null;
  phone: string;
  email?: string | null;
  dateOfBirth: string;
};

type PatientAuthUser = {
  id: string;
  name: string;
  email: string;
  role: "PATIENT";
};

type PatientAuthPayload = {
  success?: boolean;
  authenticated?: boolean;
  user?: PatientAuthUser;
  profile?: PatientAuthProfile | null;
  error?: string;
};

type PublicDoctor = {
  id: string;
  name: string;
  specialty?: string | null;
  slug?: string | null;
  bio?: string | null;
  profileImage?: string | null;
};

type BookingStepItem = {
  id: Step;
  label: string;
  icon: LucideIcon;
};

type SlotHoldState = {
  token: string;
  doctorId: string;
  startTime: string;
  appointmentType: "NORMAL" | "EXTENDED";
  expiresAt: string;
};

function BookingFlowContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slugParam = searchParams.get('doctor');
  const inviteEmailParam = searchParams.get("inviteEmail")?.trim().toLowerCase() || "";
  const inviteAuthParam = searchParams.get("auth");

  const [currentStep, setCurrentStep] = useState<Step>("auth");
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [consultType, setConsultType] = useState<"normal" | "extended">("normal");
  const [formData, setFormData] = useState({
    firstName: "",
    lastNamePaternal: "",
    lastNameMaternal: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    sex: "",
    gender: "NOT_SPECIFIED",
  });
  const [contactData, setContactData] = useState({
    relation: "SELF",
    firstName: "",
    lastNamePaternal: "",
    lastNameMaternal: "",
    phone: "",
    email: "",
  });
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);

  const [timeSlots, setTimeSlots] = useState<Array<{ start: string; end: string; type: "normal" | "extended" }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [holdingSlot, setHoldingSlot] = useState(false);
  const [slotHold, setSlotHold] = useState<SlotHoldState | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number | null>(null);
  
  // Calendar month availability caching
  const [availableDatesByMonth, setAvailableDatesByMonth] = useState<Record<string, string[]>>({});
  const [currentMonthView, setCurrentMonthView] = useState<Date>(startOfMonth(startOfToday()));
  const [loadingMonth, setLoadingMonth] = useState(false);
  const minBookableDate = startOfToday();
  const maxBookableDate = addDays(minBookableDate, 365);
  const minBookableMonth = startOfMonth(minBookableDate);
  const maxBookableMonth = startOfMonth(maxBookableDate);
  const currentMonthKey = format(startOfMonth(currentMonthView), "yyyy-MM-dd");
  const currentMonthAvailableDates = availableDatesByMonth[currentMonthKey] || [];
  const currentMonthLoaded = Object.prototype.hasOwnProperty.call(availableDatesByMonth, currentMonthKey);

  const [apiError, setApiError] = useState("");
  const [authMode, setAuthMode] = useState<"guest"|"login"|"register">("guest");
  
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    dateOfBirth: ""
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [patientUserId, setPatientUserId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [bookAsGuest, setBookAsGuest] = useState(false);
  const slotHoldRef = useRef<SlotHoldState | null>(null);
  const selectedTimeRef = useRef<string | null>(null);

  const calculateAge = (dateOfBirth: string): number | null => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(`${dateOfBirth}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasNotHadBirthdayYet =
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());

    if (hasNotHadBirthdayYet) age -= 1;
    return age >= 0 ? age : null;
  };

  const requiresLinkedEmail = isLoggedIn && !bookAsGuest;
  const normalizedEmail = formData.email.trim();
  const calculatedAge = calculateAge(formData.dateOfBirth);

  const fillContactFromPatient = useCallback(() => {
    setContactData((prev) => ({
      ...prev,
      relation: "SELF",
      firstName: formData.firstName,
      lastNamePaternal: formData.lastNamePaternal,
      lastNameMaternal: formData.lastNameMaternal,
      phone: prev.phone || formData.phone,
      email: prev.email || formData.email,
    }));
  }, [formData.firstName, formData.lastNamePaternal, formData.lastNameMaternal, formData.phone, formData.email]);

  const executeRecaptcha = useCallback(async (): Promise<string> => {
    if (!RECAPTCHA_SITE_KEY) return "";
    if (typeof window === "undefined" || !window.grecaptcha) return "";
    return new Promise((resolve) => {
      window.grecaptcha!.ready(async () => {
        try {
          const token = await window.grecaptcha!.execute(RECAPTCHA_SITE_KEY, { action: "booking" });
          resolve(token);
        } catch {
          resolve("");
        }
      });
    });
  }, []);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;
    if (document.querySelector(`script[data-recaptcha="${RECAPTCHA_SITE_KEY}"]`)) return;
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.dataset.recaptcha = RECAPTCHA_SITE_KEY;
    document.head.appendChild(script);
  }, []);

  const releaseSlotHold = useCallback(async (holdToRelease?: SlotHoldState | null) => {
    const hold = holdToRelease ?? slotHoldRef.current;
    if (!hold) return;

    try {
      await fetch("/api/agenda/public/availability/hold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: hold.doctorId,
          holdToken: hold.token,
        }),
      });
    } catch (error) {
      console.error("No se pudo liberar el hold del horario", error);
    } finally {
      if (slotHoldRef.current?.token === hold.token) {
        slotHoldRef.current = null;
        setSlotHold(null);
        setHoldSecondsLeft(null);
      }
    }
  }, []);

  const requestSlotHold = useCallback(async (slotStart: string) => {
    if (!selectedDoctorId) {
      setApiError("Selecciona un médico antes de elegir horario.");
      return false;
    }

    const appointmentType = consultType === "extended" ? "EXTENDED" : "NORMAL";

    if (
      slotHoldRef.current &&
      slotHoldRef.current.doctorId === selectedDoctorId &&
      slotHoldRef.current.startTime === slotStart &&
      slotHoldRef.current.appointmentType === appointmentType &&
      new Date(slotHoldRef.current.expiresAt).getTime() > Date.now()
    ) {
      return true;
    }

    setHoldingSlot(true);
    try {
      await releaseSlotHold(slotHoldRef.current);

      const response = await fetch("/api/agenda/public/availability/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          startTime: slotStart,
          appointmentType,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo reservar temporalmente el horario.");
      }

      const hold: SlotHoldState = {
        token: payload.holdToken,
        doctorId: selectedDoctorId,
        startTime: payload.startTime || slotStart,
        appointmentType,
        expiresAt: payload.expiresAt,
      };

      slotHoldRef.current = hold;
      setSlotHold(hold);
      setApiError("");
      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo reservar temporalmente el horario seleccionado.";
      setApiError(message);
      setSelectedTime(null);
      return false;
    } finally {
      setHoldingSlot(false);
    }
  }, [consultType, releaseSlotHold, selectedDoctorId]);

  const steps: BookingStepItem[] = [
    { id: "auth", label: "Cuenta", icon: Lock },
    { id: "doctor", label: "Médico", icon: User },
    { id: "type", label: "Tipo", icon: FileText },
    { id: "date", label: "Fecha", icon: CalendarIcon },
    { id: "time", label: "Horario", icon: Clock },
    { id: "info", label: "Datos", icon: User },
    { id: "confirm", label: "Confirmar", icon: CheckCircle2 }
  ];

  useEffect(() => {
    if (slugParam) {
      fetch(`/api/agenda/public/doctors?slug=${slugParam}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setSelectedDoctorId(data.id);
            setDoctors([data]);
          }
        })
        .finally(() => setLoadingDoctors(false));
    } else {
      fetch("/api/agenda/public/doctors")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setDoctors(data);
        })
        .finally(() => setLoadingDoctors(false));
    }
  }, [slugParam]);

  const applyPatientSession = (payload: PatientAuthPayload) => {
    if (!payload.user || payload.user.role !== "PATIENT") return;

    setIsLoggedIn(true);
    setPatientUserId(payload.user.id);
    setBookAsGuest(false);
    setAuthMode("guest");
    const profile = payload.profile;
    const hasStructuredName = Boolean(profile?.firstName && profile?.lastNamePaternal);
    const parsed = hasStructuredName
      ? {
          firstName: profile?.firstName ?? "",
          lastNamePaternal: profile?.lastNamePaternal ?? "",
          lastNameMaternal: profile?.lastNameMaternal ?? null,
        }
      : parseFullName(payload.user?.name || "");
    setFormData((prev) => ({
      ...prev,
      firstName: parsed.firstName || prev.firstName,
      lastNamePaternal: parsed.lastNamePaternal || prev.lastNamePaternal,
      lastNameMaternal: parsed.lastNameMaternal ?? prev.lastNameMaternal,
      email: payload.profile?.email || payload.user?.email || prev.email,
      phone: payload.profile?.phone || prev.phone,
      dateOfBirth: payload.profile?.dateOfBirth || prev.dateOfBirth,
    }));
  };

  useEffect(() => {
    let active = true;
    fetch("/api/auth/patient/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PatientAuthPayload | null) => {
        if (!active || !data?.authenticated) return;
        applyPatientSession(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!inviteEmailParam) return;

    setFormData((prev) => ({ ...prev, email: inviteEmailParam }));
    setLoginForm((prev) => ({ ...prev, email: inviteEmailParam }));
    setRegisterForm((prev) => ({ ...prev, email: inviteEmailParam }));

    if (!isLoggedIn) {
      if (inviteAuthParam === "login" || inviteAuthParam === "register") {
        setAuthMode(inviteAuthParam);
      } else {
        setAuthMode("register");
      }
    }
  }, [inviteAuthParam, inviteEmailParam, isLoggedIn]);

  const handlePatientLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setIsLoggedIn(false);
    setPatientUserId(null);
    setBookAsGuest(false);
    setAuthMode("guest");
  };

  useEffect(() => {
    setAvailableDatesByMonth({});
  }, [selectedDoctorId, consultType]);

  useEffect(() => {
    slotHoldRef.current = slotHold;
  }, [slotHold]);

  useEffect(() => {
    selectedTimeRef.current = selectedTime;
  }, [selectedTime]);

  useEffect(() => {
    if (!slotHold) {
      setHoldSecondsLeft(null);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = new Date(slotHold.expiresAt).getTime() - Date.now();
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setHoldSecondsLeft(seconds);

      if (seconds <= 0) {
        if (slotHoldRef.current?.token === slotHold.token) {
          slotHoldRef.current = null;
          setSlotHold(null);
          setSelectedTime((currentSelected) =>
            currentSelected === slotHold.startTime ? null : currentSelected
          );
          setApiError(
            "Tu reserva temporal de horario expiró. Selecciona nuevamente el horario para continuar."
          );
        }
      }
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(timer);
  }, [slotHold]);

  useEffect(() => {
    return () => {
      const hold = slotHoldRef.current;
      if (!hold) return;

      fetch("/api/agenda/public/availability/hold", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: hold.doctorId,
          holdToken: hold.token,
        }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!slotHoldRef.current || !selectedDoctorId) return;

    const currentHold = slotHoldRef.current;
    const holdDate = format(new Date(currentHold.startTime), "yyyy-MM-dd");
    const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
    const typeChanged = currentHold.appointmentType !== (consultType === "extended" ? "EXTENDED" : "NORMAL");
    const doctorChanged = currentHold.doctorId !== selectedDoctorId;
    const dateChanged = selectedDateKey !== null && holdDate !== selectedDateKey;

    if (doctorChanged || typeChanged || dateChanged) {
      void releaseSlotHold(currentHold);
      setSelectedTime(null);
    }
  }, [consultType, releaseSlotHold, selectedDate, selectedDoctorId]);

  // Fetch month availability when viewing calendar
  useEffect(() => {
    if (currentStep === "date" && selectedDoctorId) {
      const monthStart = startOfMonth(currentMonthView);
      const monthKey = format(monthStart, "yyyy-MM-dd");

      if (Object.prototype.hasOwnProperty.call(availableDatesByMonth, monthKey)) {
        return;
      }

      setLoadingMonth(true);
      const start = format(monthStart, "yyyy-MM-dd");
      const end = format(addMonths(monthStart, 1), "yyyy-MM-dd");
      let active = true;

      fetch(`/api/agenda/public/availability/month?startDate=${start}&endDate=${end}&type=${consultType}&doctorId=${selectedDoctorId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          setAvailableDatesByMonth((prev) => ({
            ...prev,
            [monthKey]: Array.isArray(data.dates) ? data.dates : [],
          }));
        })
        .catch((error) => {
          console.error(error);
          if (!active) return;
          setAvailableDatesByMonth((prev) => ({
            ...prev,
            [monthKey]: [],
          }));
        })
        .finally(() => {
          if (active) setLoadingMonth(false);
        });

      return () => {
        active = false;
      };
    }
  }, [currentMonthView, currentStep, selectedDoctorId, consultType, availableDatesByMonth]);

  // Fetch slots whenever date changes
  useEffect(() => {
    if (selectedDate && selectedDoctorId && (currentStep === "time" || currentStep === "date")) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      setLoadingSlots(true);
      fetch(`/api/agenda/public/availability?date=${dateStr}&type=${consultType}&doctorId=${selectedDoctorId}`)
        .then(res => res.json())
        .then(data => {
          const slots: Array<{ start: string; end: string; type: "normal" | "extended" }> = Array.isArray(data.slots)
            ? data.slots.filter(
                (slot: unknown): slot is { start: string; end: string; type: "normal" | "extended" } => {
                  if (!slot || typeof slot !== "object") return false;
                  const candidate = slot as { start?: unknown; end?: unknown; type?: unknown };
                  return (
                    typeof candidate.start === "string" &&
                    typeof candidate.end === "string" &&
                    (candidate.type === "normal" || candidate.type === "extended")
                  );
                }
              )
            : [];
          setTimeSlots(slots);
          const currentSelectedTime = selectedTimeRef.current;
          const selectedStillAvailable = currentSelectedTime
            ? slots.some((slot) => slot.start === currentSelectedTime)
            : false;
          if (!selectedStillAvailable && currentSelectedTime) {
            setSelectedTime(null);
            if (slotHoldRef.current) {
              void releaseSlotHold(slotHoldRef.current);
            }
          }
        })
        .catch(err => {
          console.error(err);
          setTimeSlots([]);
        })
        .finally(() => setLoadingSlots(false));
    }
  }, [consultType, currentStep, releaseSlotHold, selectedDate, selectedDoctorId]);

  const handleSelectTime = async (slotStart: string) => {
    setApiError("");
    const holdOk = await requestSlotHold(slotStart);
    if (holdOk) {
      setSelectedTime(slotStart);
    }
  };

  const hasCompletePatientData = () => {
    return Boolean(
      formData.firstName.trim() &&
      formData.lastNamePaternal.trim() &&
      formData.dateOfBirth &&
      formData.sex &&
      contactData.firstName.trim() &&
      contactData.lastNamePaternal.trim() &&
      contactData.phone.trim() &&
      contactData.relation &&
      (!requiresLinkedEmail || normalizedEmail)
    );
  };

  const handleNext = () => {
    const stepOrder: Step[] = slugParam
      ? ["auth", "type", "date", "time", "info", "confirm"]
      : ["auth", "doctor", "type", "date", "time", "info", "confirm"];
    const nextIndex = stepOrder.indexOf(currentStep) + 1;
    if (nextIndex >= stepOrder.length) return;

    const nextStep = stepOrder[nextIndex];
    if (nextStep === "info" && hasCompletePatientData()) {
      setCurrentStep("confirm");
      return;
    }
    setCurrentStep(nextStep);
  };

  const handleBack = () => {
    const stepOrder: Step[] = slugParam
      ? ["auth", "type", "date", "time", "info", "confirm"]
      : ["auth", "doctor", "type", "date", "time", "info", "confirm"];
    const prevIndex = stepOrder.indexOf(currentStep) - 1;
    if (prevIndex < 0) {
      router.push("/");
      return;
    }

    const prevStep = stepOrder[prevIndex];
    if (prevStep === "info" && hasCompletePatientData()) {
      setCurrentStep("time");
      return;
    }
    setCurrentStep(prevStep);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError("");
    if (registerForm.password !== registerForm.confirmPassword) {
      setApiError("Las contraseñas no coinciden");
      return;
    }
    try {
      const res = await fetch('/api/auth/patient/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
          phone: registerForm.phone,
          dateOfBirth: registerForm.dateOfBirth
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrarse');
      
      // Auto-login after register
      setLoginForm({ email: registerForm.email, password: registerForm.password });
      // Now actually log in
      const loginRes = await fetch('/api/auth/patient/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registerForm.email, password: registerForm.password })
      });
      const loginData = await loginRes.json() as PatientAuthPayload;
      if (loginRes.ok) {
        applyPatientSession(loginData);
        handleNext();
      } else {
        // Registration ok but auto-login failed, move to login screen
        setAuthMode("login");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al registrarse";
      setApiError(message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError("");
    try {
      const res = await fetch('/api/auth/patient/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json() as PatientAuthPayload;
      if (!res.ok) throw new Error(data.error || 'Credenciales inválidas');
      applyPatientSession(data);
      handleNext();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al iniciar sesión";
      setApiError(message);
    }
  };

  const handleConfirm = async () => {
    if (selectedDate && selectedTime) {
      setApiError("");
      if (!privacyConsentAccepted) {
        setApiError("Debes aceptar el aviso de privacidad para continuar.");
        return;
      }
      if (requiresLinkedEmail && !normalizedEmail) {
        setApiError("El correo es obligatorio cuando agendas con cuenta vinculada.");
        setCurrentStep("info");
        return;
      }

      const activeHold = slotHoldRef.current;
      if (
        !activeHold ||
        activeHold.startTime !== selectedTime ||
        activeHold.doctorId !== selectedDoctorId ||
        new Date(activeHold.expiresAt).getTime() <= Date.now()
      ) {
        setApiError("Debes volver a seleccionar el horario para confirmar la cita.");
        setSelectedTime(null);
        setSlotHold(null);
        slotHoldRef.current = null;
        setCurrentStep("time");
        return;
      }

      try {
        const recaptchaToken = await executeRecaptcha();
        const res = await fetch('/api/agenda/public/appointments', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            firstName: formData.firstName.trim(),
            lastNamePaternal: formData.lastNamePaternal.trim(),
            lastNameMaternal: formData.lastNameMaternal.trim() || undefined,
            email: normalizedEmail,
            phone: formData.phone,
            dateOfBirth: formData.dateOfBirth,
            sex: formData.sex || undefined,
            gender: formData.gender || undefined,
            contact: {
              relation: contactData.relation,
              firstName: contactData.firstName.trim(),
              lastNamePaternal: contactData.lastNamePaternal.trim(),
              lastNameMaternal: contactData.lastNameMaternal.trim() || undefined,
              phone: contactData.phone.trim(),
              email: contactData.email.trim() || undefined,
            },
            userId: bookAsGuest ? undefined : patientUserId || undefined,
            bookAsGuest,
            appointmentType: consultType.toUpperCase(),
            startTime: selectedTime,
            doctorId: selectedDoctorId,
            holdToken: activeHold.token,
            privacyConsentAccepted,
            recaptchaToken,
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al agendar cita');

        slotHoldRef.current = null;
        setSlotHold(null);
        setHoldSecondsLeft(null);

        try {
          if (data.appointment) {
            sessionStorage.setItem(
              "mi-doc:last-booking",
              JSON.stringify({
                appointmentId: data.appointment.id,
                startTime: data.appointment.startTime,
                endTime: data.appointment.endTime,
                appointmentType: data.appointment.appointmentType,
                durationMin: data.appointment.durationMin,
                doctor: data.appointment.doctor,
                patientName: [formData.firstName, formData.lastNamePaternal, formData.lastNameMaternal].filter(Boolean).join(" ").trim(),
                questionnaireUrl: data.questionnaire?.url ?? null,
              })
            );
          }
        } catch {
          // ignore storage errors
        }

        if (data.questionnaire && data.questionnaire.url) {
          const encoded = encodeURIComponent(data.questionnaire.url);
          router.push(`/confirmacion?cuestionario=${encoded}`);
        } else {
          router.push("/confirmacion");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error al confirmar la reserva";
        setApiError(message);
      }
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case "auth": return true; // Can always skip
      case "doctor": return selectedDoctorId !== null;
      case "date": return selectedDate !== undefined;
      case "time":
        return (
          selectedTime !== null &&
          Boolean(
            slotHold &&
            slotHold.startTime === selectedTime &&
            new Date(slotHold.expiresAt).getTime() > Date.now()
          )
        );
      case "type": return consultType !== null;
      case "info":
        return !!(hasCompletePatientData() && privacyConsentAccepted);
      case "confirm": return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="bg-card border-b border-border px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium hidden sm:inline">Volver</span>
          </button>
          <h1 className="text-xl font-semibold">Agendar cita</h1>
          <div className="w-20" />
        </div>
      </div>

      {(() => {
        const visibleSteps = steps.filter(s => !(slugParam && s.id === 'doctor'));
        const currentIndex = visibleSteps.findIndex(s => s.id === currentStep);
        const currentMeta = visibleSteps[currentIndex];
        const progressPct = Math.round(((currentIndex + 1) / visibleSteps.length) * 100);
        const CurrentIcon = currentMeta?.icon;
        return (
          <div className="bg-card border-b border-border">
            {/* Mobile: compact progress */}
            <div className="md:hidden px-4 py-3 max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {CurrentIcon && (
                    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <CurrentIcon className="w-4 h-4" />
                    </span>
                  )}
                  <span>{currentMeta?.label}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Paso {currentIndex + 1} de {visibleSteps.length}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Desktop: full stepper */}
            <div className="hidden md:block px-6 py-6">
              <div className="max-w-4xl mx-auto flex items-center justify-between">
                {visibleSteps.map((step, index, arr) => {
                  const stepIdx = steps.findIndex(s => s.id === step.id);
                  const currentIdx = steps.findIndex(s => s.id === currentStep);
                  const reached = currentIdx >= stepIdx;
                  const passed = currentIdx > stepIdx;
                  return (
                    <div key={step.id} className="flex items-center flex-1">
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                            reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <step.icon className="w-5 h-5" />
                        </div>
                        <span className={`text-xs font-medium ${reached ? "" : "text-muted-foreground"}`}>
                          {step.label}
                        </span>
                      </div>
                      {index < arr.length - 1 && (
                        <div className={`h-0.5 flex-1 transition-all ${passed ? "bg-primary" : "bg-border"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sticky hold timer */}
      {slotHold && holdSecondsLeft !== null && holdSecondsLeft > 0 && (currentStep === "time" || currentStep === "info" || currentStep === "confirm") && (() => {
        const HOLD_TOTAL_SECONDS = 300;
        const pct = Math.max(0, Math.min(100, (holdSecondsLeft / HOLD_TOTAL_SECONDS) * 100));
        const minutes = Math.floor(holdSecondsLeft / 60);
        const seconds = holdSecondsLeft % 60;
        const urgent = holdSecondsLeft <= 60;
        return (
          <div className={`sticky top-16 z-30 border-b bg-card shadow-sm transition-colors ${urgent ? "border-destructive/40" : "border-primary/30"}`}>
            <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-3">
              <Clock className={`w-4 h-4 flex-shrink-0 ${urgent ? "text-destructive" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs md:text-sm text-foreground truncate">
                    Horario reservado temporalmente
                  </span>
                  <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${urgent ? "text-destructive" : "text-primary"}`}>
                    {minutes}:{seconds.toString().padStart(2, "0")}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden mt-1">
                  <div
                    className={`h-full transition-all duration-1000 ease-linear ${urgent ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sticky selection summary */}
      {(() => {
        const selectedDoctor = selectedDoctorId ? doctors.find(d => d.id === selectedDoctorId) : null;
        const hasAnySelection = Boolean(selectedDoctor || selectedDate || selectedTime);
        const showSummary = hasAnySelection && currentStep !== "auth" && currentStep !== "doctor";
        if (!showSummary) return null;

        const chips: Array<{ key: string; label: string; value: string; step: Step }> = [];
        if (selectedDoctor) {
          chips.push({ key: "doctor", label: "Médico", value: selectedDoctor.name, step: "doctor" });
        }
        chips.push({
          key: "type",
          label: "Tipo",
          value: consultType === "extended" ? "Primera vez" : "Consulta",
          step: "type",
        });
        if (selectedDate) {
          chips.push({
            key: "date",
            label: "Fecha",
            value: format(selectedDate, "dd MMM", { locale: es }),
            step: "date",
          });
        }
        if (selectedTime) {
          chips.push({
            key: "time",
            label: "Hora",
            value: format(new Date(selectedTime), "HH:mm"),
            step: "time",
          });
        }

        return (
          <div className="border-b border-border bg-background/80 backdrop-blur">
            <div className="max-w-4xl mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto hide-scrollbar">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    if (slugParam && chip.step === "doctor") return;
                    setCurrentStep(chip.step);
                  }}
                  disabled={slugParam !== null && chip.step === "doctor"}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-default"
                >
                  <span className="text-muted-foreground">{chip.label}:</span>
                  <span className="font-medium text-foreground truncate max-w-[140px]">{chip.value}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="px-4 md:px-6 py-8 md:py-12">
        <div className={`mx-auto ${currentStep === "date" ? "max-w-5xl" : "max-w-3xl"}`}>
          {apiError && <div className="p-4 mb-6 text-sm text-red-500 bg-red-100/10 border border-red-500 rounded-lg">{apiError}</div>}
          
          <AnimatePresence mode="wait">
            
            {/* AUTH STEP */}
            {currentStep === "auth" && (
              <motion.div key="auth" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -20 }}>
                {inviteEmailParam && !isLoggedIn && (
                  <div className="mb-6 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
                    Invitación detectada. Usa el correo <span className="font-semibold">{inviteEmailParam}</span>{" "}
                    para vincular tu cuenta con tu expediente.
                  </div>
                )}
                {checkingSession ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Lock className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <h2 className="text-2xl font-semibold mb-2">Verificando sesión</h2>
                    <p className="text-muted-foreground">Un momento, estamos validando tu cuenta de paciente...</p>
                  </div>
                ) : isLoggedIn ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-success" />
                    </div>
                    <h2 className="text-2xl font-semibold mb-2">Has iniciado sesión</h2>
                    <p className="text-muted-foreground mb-8">Puedes continuar vinculando tu expediente o agendar sin vincular esta cita.</p>
                    <div className="max-w-sm mx-auto flex flex-col gap-3">
                      <Button
                        onClick={() => {
                          setBookAsGuest(false);
                          handleNext();
                        }}
                        className="w-full h-12"
                      >
                        Continuar con esta cuenta
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setBookAsGuest(true);
                          handleNext();
                        }}
                        className="w-full h-12"
                      >
                        Agendar sin vincular cuenta
                      </Button>
                      <Button variant="tertiary" onClick={handlePatientLogout} className="w-full h-10 text-sm">
                        Cerrar sesión
                      </Button>
                      <Button
                        variant="tertiary"
                        onClick={() => router.push("/paciente/historial")}
                        className="w-full h-10 text-sm"
                      >
                        Ver mi historial
                      </Button>
                      <Button
                        variant="tertiary"
                        onClick={() => router.push("/paciente/cuenta")}
                        className="w-full h-10 text-sm"
                      >
                        Mi cuenta
                      </Button>
                    </div>
                  </div>
                ) : authMode === "guest" ? (
                  <div className="space-y-6 text-center max-w-md mx-auto">
                    <h2 className="text-2xl font-semibold mb-2">Bienvenido</h2>
                    <p className="text-muted-foreground">Inicia sesión para vincular tu expediente automático o continúa como invitado.</p>
                    <div className="flex flex-col gap-3 pt-4">
                      <Button onClick={() => setAuthMode("login")} className="w-full h-14 text-lg">
                         <LogIn className="w-5 h-5 mr-2" /> Iniciar Sesión
                      </Button>
                      <Button variant="secondary" onClick={() => { setApiError(""); setAuthMode("register"); }} className="w-full h-12">
                         Crear una cuenta
                      </Button>
                      <div className="flex items-center gap-3 my-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground">o</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <Button variant="tertiary" onClick={handleNext} className="w-full h-10 text-sm">
                         Continuar como Invitado
                      </Button>
                    </div>
                  </div>
                ) : authMode === "login" ? (
                  <div className="max-w-sm mx-auto">
                    <h2 className="text-2xl font-semibold mb-2">Iniciar Sesión</h2>
                    <p className="text-muted-foreground mb-6">Ingresa a tu cuenta de paciente.</p>
                    <form onSubmit={handleLogin} className="space-y-4">
                      <Input label="Correo" type="email" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required/>
                      <Input label="Contraseña" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required/>
                      <Button fullWidth type="submit" className="h-12 mt-4">Entrar</Button>
                      <p className="text-center text-sm text-muted-foreground pt-2">
                        ¿No tienes cuenta?{" "}
                        <button type="button" onClick={() => { setApiError(""); setAuthMode("register"); }} className="text-primary font-semibold hover:underline">
                          Regístrate aquí
                        </button>
                      </p>
                      <Button fullWidth variant="tertiary" type="button" onClick={() => { setApiError(""); setAuthMode("guest"); }}>Volver</Button>
                    </form>
                  </div>
                ) : (
                  <div className="max-w-sm mx-auto">
                    <h2 className="text-2xl font-semibold mb-2">Crear Cuenta</h2>
                    <p className="text-muted-foreground mb-6">Es gratis y solo toma un momento.</p>
                    <form onSubmit={handleRegister} className="space-y-4">
                      <Input label="Nombre completo" placeholder="Tu nombre" value={registerForm.name} onChange={e => setRegisterForm({...registerForm, name: e.target.value})} required/>
                      <Input label="Correo electrónico" type="email" placeholder="tu@email.com" value={registerForm.email} onChange={e => setRegisterForm({...registerForm, email: e.target.value})} required/>
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Teléfono" type="tel" inputMode="numeric" placeholder="10 dígitos" value={registerForm.phone} onChange={e => setRegisterForm({...registerForm, phone: e.target.value})} required/>
                        <Input label="Nacimiento" type="date" value={registerForm.dateOfBirth} onChange={e => setRegisterForm({...registerForm, dateOfBirth: e.target.value})} required/>
                      </div>
                      <Input label="Contraseña" type="password" placeholder="Mínimo 6 caracteres" value={registerForm.password} onChange={e => setRegisterForm({...registerForm, password: e.target.value})} required/>
                      <Input label="Confirmar contraseña" type="password" placeholder="Repite tu contraseña" value={registerForm.confirmPassword} onChange={e => setRegisterForm({...registerForm, confirmPassword: e.target.value})} required/>
                      <Button fullWidth type="submit" className="h-12 mt-4">Crear cuenta y continuar</Button>
                      <p className="text-center text-sm text-muted-foreground pt-2">
                        ¿Ya tienes cuenta?{" "}
                        <button type="button" onClick={() => { setApiError(""); setAuthMode("login"); }} className="text-primary font-semibold hover:underline">
                          Inicia sesión
                        </button>
                      </p>
                      <Button fullWidth variant="tertiary" type="button" onClick={() => { setApiError(""); setAuthMode("guest"); }}>Volver</Button>
                    </form>
                  </div>
                )}
              </motion.div>
            )}

            {/* DOCTOR STEP */}
            {currentStep === "doctor" && (
              <motion.div key="doctor" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-2xl font-semibold mb-2">Selecciona un Especialista</h2>
                <p className="text-muted-foreground mb-8">Elige el médico con quien deseas tu consulta</p>
                {loadingDoctors ? (
                  <FeedbackState
                    variant="loading"
                    title="Cargando médicos"
                    description="Obteniendo especialistas disponibles."
                    compact
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {doctors.map(doc => (
                      <motion.button
                        key={doc.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedDoctorId(doc.id)}
                        className={`p-4 rounded-xl border-2 transition-all flex gap-4 text-left ${selectedDoctorId === doc.id ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/50"}`}
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                          {doc.profileImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={doc.profileImage} alt={doc.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold">{doc.name.substring(0, 2).toUpperCase()}</div>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground text-lg">{doc.name}</div>
                          <div className="text-sm text-primary font-medium mb-1">{doc.specialty || "Médico Especialista"}</div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* CONSULT TYPE STEP */}
            {currentStep === "type" && (
              <motion.div key="type" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-2xl font-semibold mb-2">Tipo de consulta</h2>
                <p className="text-muted-foreground mb-8">Selecciona el tipo de consulta que necesitas</p>
                <RadioGroup
                  value={consultType}
                  onValueChange={(value) => setConsultType(value as "normal" | "extended")}
                  options={[
                    { value: "normal", label: "Consulta Normal", description: "Revisión habitual / Chequeo" },
                    { value: "extended", label: "Primera Vez / Integral", description: "Mayor duración y revisión especializada"}
                  ]}
                />
              </motion.div>
            )}

            {/* DATE STEP (CUSTOM MONTHLY GRID) */}
            {currentStep === "date" && (
              <motion.div key="date" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-semibold mb-2">Selecciona una fecha</h2>
                  <p className="text-muted-foreground">Solo se muestran días con horarios disponibles</p>
                </div>

                <div className="w-full max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  {/* Month Navigator */}
                  <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                    <button
                      onClick={() => {
                        const prev = new Date(currentMonthView);
                        prev.setMonth(prev.getMonth() - 1);
                        if (prev >= minBookableMonth) setCurrentMonthView(prev);
                      }}
                      disabled={currentMonthView <= minBookableMonth}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <span className="font-semibold text-foreground capitalize text-lg md:text-xl">
                      {format(currentMonthView, "MMMM yyyy", { locale: es })}
                    </span>
                    <button
                      onClick={() => {
                        const next = new Date(currentMonthView);
                        next.setMonth(next.getMonth() + 1);
                        if (next <= maxBookableMonth) setCurrentMonthView(next);
                      }}
                      disabled={currentMonthView >= maxBookableMonth}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>

                  {/* Day headers Sun–Sat */}
                  <div className="grid grid-cols-7 border-b border-border">
                    {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d => (
                      <div key={d} className="py-3 text-center text-sm font-semibold text-muted-foreground">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  {(() => {
                    const year = currentMonthView.getFullYear();
                    const month = currentMonthView.getMonth();
                    const firstDay = new Date(year, month, 1);
                    // Sunday=0 offset
                    const startOffset = firstDay.getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const daysInPrevMonth = new Date(year, month, 0).getDate();
                    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
                    const today = startOfToday();

                    return (
                      <div className={`grid grid-cols-7 p-3 md:p-4 gap-1.5 md:gap-2 ${loadingMonth ? "opacity-60 pointer-events-none" : ""}`}>
                        {Array.from({ length: totalCells }, (_, i) => {
                          const dayNum = i - startOffset + 1;

                          // Cells outside current month — show grayed
                          if (dayNum < 1) {
                            const prevDay = daysInPrevMonth + dayNum;
                            return (
                              <div key={i} className="aspect-square w-full rounded-xl text-sm md:text-base flex items-center justify-center text-muted-foreground/25">
                                {prevDay}
                              </div>
                            );
                          }
                          if (dayNum > daysInMonth) {
                            const nextDay = dayNum - daysInMonth;
                            return (
                              <div key={i} className="aspect-square w-full rounded-xl text-sm md:text-base flex items-center justify-center text-muted-foreground/25">
                                {nextDay}
                              </div>
                            );
                          }

                          const date = new Date(year, month, dayNum);
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const isPast = date < today;
                          const isTooFar = date > maxBookableDate;
                          const monthKey = format(startOfMonth(date), "yyyy-MM-dd");
                          const monthDates = availableDatesByMonth[monthKey];
                          const hasSlots = monthDates?.includes(dateStr) ?? false;
                          const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateStr;
                          const isDisabled = isPast || isTooFar || !hasSlots;
                          const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');

                          return (
                            <button
                              key={i}
                              onClick={() => {
                                if (!isDisabled) {
                                  if (slotHoldRef.current) {
                                    void releaseSlotHold(slotHoldRef.current);
                                  }
                                  setSelectedDate(date);
                                  setSelectedTime(null);
                                  handleNext();
                                }
                              }}
                              disabled={isDisabled}
                              className={`
                                aspect-square w-full rounded-xl text-base md:text-lg font-medium transition-all flex items-center justify-center
                                ${isSelected
                                  ? "bg-primary text-primary-foreground shadow-md"
                                  : hasSlots && !isDisabled
                                    ? "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground cursor-pointer"
                                    : "text-muted-foreground/40 cursor-default"
                                }
                                ${isToday && !isSelected ? "ring-2 ring-primary ring-offset-1" : ""}
                              `}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Footer */}
                  <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-primary/20 inline-block" />
                      <span>Con disponibilidad</span>
                    </div>
                    {loadingMonth && <span className="animate-pulse">Cargando...</span>}
                    {!loadingMonth && currentMonthLoaded && currentMonthAvailableDates.length === 0 && (
                      <span>Sin horarios este mes</span>
                    )}
                  </div>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-4 max-w-sm mx-auto">
                  Los días disponibles dependen de la agenda del médico. Navega entre meses para ver más opciones.
                </p>
              </motion.div>
            )}


            {/* TIME STEP */}
            {currentStep === "time" && (
              <motion.div key="time" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-2xl font-semibold mb-2">Selecciona un horario</h2>
                <p className="text-muted-foreground mb-8">Disponibilidad para: {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM yyyy", { locale: es })}</p>

                {loadingSlots ? (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
                    {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-secondary rounded-xl"></div>)}
                  </div>
                ) : timeSlots.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {timeSlots.map((slot) => {
                      const dateObj = new Date(slot.start);
                      const timeString = format(dateObj, 'HH:mm');
                      return (
                        <TimeSlot
                          key={slot.start}
                          time={timeString}
                          available={!holdingSlot}
                          selected={selectedTime === slot.start}
                          onClick={() => {
                            void handleSelectTime(slot.start);
                          }}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-secondary/30 rounded-2xl border border-border">
                    <p className="text-muted-foreground">No quedan horarios disponibles este día.</p>
                    <Button variant="tertiary" className="mt-4" onClick={handleBack}>Probar otro día</Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* INFO STEP */}
            {currentStep === "info" && (
              <motion.div key="info" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="text-2xl font-semibold mb-2">Datos para la cita</h2>
                <p className="text-muted-foreground mb-8">
                  {isLoggedIn && !bookAsGuest
                    ? "Tus datos básicos (puedes cambiarlos si agendas para alguien más)"
                    : "Completa la información del paciente y el acompañante"}
                </p>

                {/* Datos del paciente */}
                <section className="max-w-2xl">
                  <h3 className="text-lg font-semibold mb-4">Datos del paciente</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Nombre(s)*" placeholder="Ej. María Fernanda" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                    <Input label="Apellido Paterno*" placeholder="Ej. González" value={formData.lastNamePaternal} onChange={e => setFormData({ ...formData, lastNamePaternal: e.target.value })} />
                    <Input label="Apellido Materno" placeholder="Opcional" value={formData.lastNameMaternal} onChange={e => setFormData({ ...formData, lastNameMaternal: e.target.value })} />
                    <Input
                      label="Fecha de Nacimiento*"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      helperText={calculatedAge !== null ? `Edad: ${calculatedAge} años` : undefined}
                    />
                    <Select
                      label="Sexo*"
                      placeholder="Selecciona..."
                      options={SEX_OPTIONS}
                      value={formData.sex}
                      onValueChange={(value) => setFormData({ ...formData, sex: value })}
                    />
                    <Select
                      label="Género"
                      placeholder="Selecciona..."
                      options={GENDER_OPTIONS}
                      value={formData.gender}
                      onValueChange={(value) => setFormData({ ...formData, gender: value })}
                    />
                  </div>
                </section>

                {/* Datos del acompañante */}
                <section className="max-w-2xl mt-10">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-lg font-semibold">Datos del acompañante</h3>
                    <button
                      type="button"
                      onClick={fillContactFromPatient}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Usar mismo nombre del paciente
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Select
                        label="Relación con el paciente*"
                        placeholder="Selecciona..."
                        options={RELATION_OPTIONS}
                        value={contactData.relation}
                        onValueChange={(value) => setContactData({ ...contactData, relation: value })}
                      />
                    </div>
                    <Input label="Nombre(s)*" value={contactData.firstName} onChange={e => setContactData({ ...contactData, firstName: e.target.value })} />
                    <Input label="Apellido Paterno*" value={contactData.lastNamePaternal} onChange={e => setContactData({ ...contactData, lastNamePaternal: e.target.value })} />
                    <Input label="Apellido Materno" placeholder="Opcional" value={contactData.lastNameMaternal} onChange={e => setContactData({ ...contactData, lastNameMaternal: e.target.value })} />
                    <Input label="Celular*" type="tel" inputMode="numeric" placeholder="10 dígitos" value={contactData.phone} onChange={e => setContactData({ ...contactData, phone: e.target.value })} />
                    <div className="sm:col-span-2">
                      <Input
                        label="Correo Electrónico"
                        type="email"
                        placeholder="Opcional"
                        value={contactData.email}
                        onChange={e => setContactData({ ...contactData, email: e.target.value })}
                      />
                    </div>
                  </div>
                </section>

                {/* Teléfono de contacto del paciente (legacy — requerido por la API) */}
                <section className="max-w-2xl mt-10">
                  <h3 className="text-lg font-semibold mb-4">Contacto del paciente</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="Teléfono*" type="tel" inputMode="numeric" placeholder="10 dígitos" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    <Input
                      label={requiresLinkedEmail ? "Correo electrónico*" : "Correo electrónico"}
                      type="email"
                      placeholder={requiresLinkedEmail ? "Obligatorio con cuenta vinculada" : "Opcional"}
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      required={requiresLinkedEmail}
                    />
                  </div>
                </section>

                <label className="max-w-2xl mt-8 flex items-start gap-3 rounded-2xl border border-border bg-secondary/20 p-4">
                  <input
                    type="checkbox"
                    checked={privacyConsentAccepted}
                    onChange={(e) => setPrivacyConsentAccepted(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    Acepto el aviso de privacidad y autorizo el uso operativo de mis datos para agendar, confirmar la cita y
                    poner el expediente a disposición del médico responsable.
                  </span>
                </label>

                {RECAPTCHA_SITE_KEY && (
                  <p className="mt-6 text-xs text-muted-foreground max-w-2xl">
                    Este sitio está protegido por reCAPTCHA y aplican la{" "}
                    <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">Política de Privacidad</a> y los{" "}
                    <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="underline">Términos de Servicio</a> de Google.
                  </p>
                )}
              </motion.div>
            )}

            {/* CONFIRM STEP */}
            {currentStep === "confirm" && (
              <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-semibold mb-2">Revisión de Reserva</h2>
                  <p className="text-muted-foreground">Verifica que tus datos sean correctos</p>
                </div>
                <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-6 max-w-xl mx-auto shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Fecha y hora</div>
                    <div className="text-xl font-semibold text-foreground capitalize">
                      {selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: es })}
                    </div>
                    <div className="text-2xl font-bold text-primary mt-1">
                      {selectedTime && format(new Date(selectedTime), "HH:mm")}
                    </div>
                  </div>
                  <div className="border-t border-border pt-4">
                    <div className="text-sm text-muted-foreground mb-1">Paciente</div>
                    <div className="font-semibold text-lg">
                      {[formData.firstName, formData.lastNamePaternal, formData.lastNameMaternal].filter(Boolean).join(" ").trim()}
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-col gap-1">
                      <span>📱 {formData.phone}</span>
                      <span>
                        🎂 {formData.dateOfBirth}
                        {calculatedAge !== null ? ` (${calculatedAge} años)` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={privacyConsentAccepted}
                        onChange={(e) => setPrivacyConsentAccepted(e.target.checked)}
                        className="mt-0.5 h-5 w-5 rounded border-border accent-primary flex-shrink-0"
                      />
                      <span className="text-sm text-foreground leading-snug">
                        Acepto el <a href="/privacidad" target="_blank" rel="noreferrer" className="text-primary underline">aviso de privacidad</a> y autorizo el uso operativo de mis datos para agendar,
                        confirmar la cita y poner el expediente a disposición del médico responsable.
                      </span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* GLOBAL NAVIGATION BUTTONS */}
          <div className="mt-12 flex gap-4">
            {currentStep !== "confirm" && currentStep !== "date" && currentStep !== "auth" && (
              <Button size="lg" className="w-full min-h-[56px]" onClick={handleNext} disabled={!canProceed()}>Continuar</Button>
            )}
            {currentStep === "confirm" && (
              <Button
                size="lg"
                className="w-full min-h-[60px] text-lg shadow-lg shadow-primary/20"
                onClick={handleConfirm}
                disabled={!privacyConsentAccepted}
              >
                Confirmar Reserva
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookingFlow() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <FeedbackState
              variant="loading"
              title="Cargando módulo de agenda"
              description="Preparando disponibilidad y flujo de reserva."
            />
          </div>
        </div>
      }
    >
      <BookingFlowContent />
    </Suspense>
  )
}

