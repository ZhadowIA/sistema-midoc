export const mockDoctor = {
  id: "dr-001",
  name: "Dr. Carlos Mendoza",
  email: "carlos.mendoza@midoc.app",
  specialty: "FAMILY_MEDICINE",
  phone: "+34 666 123 456",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos",
  clinicName: "Clínica MiDoc",
  address: "Calle Principal 42, Madrid",
};

export const mockAppointments = [
  {
    id: "apt-001",
    patientName: "María García López",
    patientEmail: "maria.garcia@email.com",
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    time: "10:30",
    status: "CONFIRMED",
    type: "CONSULTATION",
  },
  {
    id: "apt-002",
    patientName: "Juan Pérez Rodríguez",
    patientEmail: "juan.perez@email.com",
    date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    time: "14:00",
    status: "PENDING",
    type: "FOLLOW_UP",
  },
  {
    id: "apt-003",
    patientName: "Rosa Martínez González",
    patientEmail: "rosa.martinez@email.com",
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    time: "09:00",
    status: "CONFIRMED",
    type: "CONSULTATION",
  },
];

export const mockPatients = [
  {
    id: "pat-001",
    firstName: "María",
    lastName: "García",
    email: "maria.garcia@email.com",
    phone: "+34 666 111 111",
    age: 35,
    lastVisit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: "pat-002",
    firstName: "Juan",
    lastName: "Pérez",
    email: "juan.perez@email.com",
    phone: "+34 666 222 222",
    age: 52,
    lastVisit: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
  {
    id: "pat-003",
    firstName: "Rosa",
    lastName: "Martínez",
    email: "rosa.martinez@email.com",
    phone: "+34 666 333 333",
    age: 28,
    lastVisit: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
];

export const mockPlans = [
  {
    id: "plan-agenda",
    name: "Plan Agenda",
    price: 299,
    billingPeriod: "month",
    description: "Agenda en línea con recordatorios y operación administrativa básica.",
    features: [
      "Agenda en línea",
      "Recordatorios WhatsApp",
      "Gestión de waitlist",
      "Disponibilidad configurable",
      "Notificaciones automáticas",
    ],
    highlighted: false,
    cta: "Comenzar",
  },
  {
    id: "plan-clinical",
    name: "Plan Clínico",
    price: 449,
    billingPeriod: "month",
    description: "Expediente clínico, historia médica, notas, recetas y firma clínica sin agenda.",
    features: [
      "Expediente clínico completo",
      "Historia médica estructurada",
      "Generación de notas",
      "Gestión de recetas",
      "Firma clínica digital",
      "Encuentros standalone",
    ],
    highlighted: false,
    cta: "Suscribirse",
  },
  {
    id: "plan-integral",
    name: "Plan Integral",
    price: 599,
    billingPeriod: "month",
    description: "Agenda + sistema clínico trabajando en conjunto.",
    features: [
      "Agenda completa",
      "Expediente clínico integrado",
      "Historia médica",
      "Notas y recetas",
      "Recordatorios WhatsApp",
      "Disponibilidad avanzada",
      "Firma clínica digital",
    ],
    highlighted: true,
    cta: "Suscribirse ahora",
  },
];

export const mockAiAddOns = [
  {
    id: "addon-ai-30",
    name: "Add-on IA 30%",
    price: 359,
    billingPeriod: "month",
    description: "IA clínica en el 30% de tus consultas (126 consultas/mes).",
    features: [
      "Transcripción automática",
      "SOAP estructurado",
      "Insights diagnósticos",
      "Validación farmacológica",
      "Indicaciones para paciente",
    ],
    highlighted: false,
    cta: "Agregar",
  },
  {
    id: "addon-ai-60",
    name: "Add-on IA 60%",
    price: 669,
    billingPeriod: "month",
    description: "IA clínica en el 60% de tus consultas (252 consultas/mes).",
    features: [
      "Transcripción automática",
      "SOAP estructurado",
      "Insights diagnósticos",
      "Validación farmacológica",
      "Indicaciones para paciente",
      "Mejor cobertura mensual",
    ],
    highlighted: false,
    cta: "Agregar",
  },
  {
    id: "addon-ai-100",
    name: "Add-on IA Ilimitado",
    price: 999,
    billingPeriod: "month",
    description: "IA clínica en todas tus consultas (420 consultas/mes).",
    features: [
      "Transcripción automática",
      "SOAP estructurado",
      "Insights diagnósticos",
      "Validación farmacológica",
      "Indicaciones para paciente",
      "Acceso completo",
    ],
    highlighted: true,
    cta: "Agregar",
  },
];

export const mockUsageStats = {
  totalCalls: 342,
  totalTokens: 128450,
  estimatedCost: 5.24,
  acceptanceRate: 78,
};

export const mockDashboardWidgets = [
  { id: "today-appointments", label: "Citas hoy", value: "12", trend: "+8%" },
  { id: "new-patients", label: "Pacientes nuevos", value: "24", trend: "+12%" },
  { id: "ai-usage", label: "Uso IA (7 días)", value: "71%", trend: "+5%" },
  { id: "governance", label: "Cumplimiento", value: "96%", trend: "+1%" },
];

export const mockFeatures = [
  {
    id: "feat-1",
    title: "Nota SOAP Automática",
    description: "Generación automática de notas clínicas SOAP a partir de audio o transcripción",
    icon: "📝",
  },
  {
    id: "feat-2",
    title: "Entrevista IA por Voz",
    description: "Sistema inteligente de preguntas con VAD (Voice Activity Detection) para cuestionarios",
    icon: "🎤",
  },
  {
    id: "feat-3",
    title: "Insights Clínicos",
    description: "Sugerencias diagnósticas y terapéuticas basadas en IA, validadas por médico",
    icon: "🧠",
  },
  {
    id: "feat-4",
    title: "Playbooks por Especialidad",
    description: "8 especialidades con templates estructurados y campos específicos",
    icon: "📋",
  },
];

export const mockTestimonials = [
  {
    name: "Dr. Javier López",
    specialty: "Medicina Familiar",
    clinic: "Centro Médico Madrid",
    text: "MiDoc me ha ahorrado 2 horas diarias en documentación. La IA es muy precisa.",
    rating: 5,
  },
  {
    name: "Dra. Elena García",
    specialty: "Pediatría",
    clinic: "Clínica Infantil Plus",
    text: "La entrevista por voz con los padres es increíblemente eficiente. Ya no me puedo pasar sin ella.",
    rating: 5,
  },
  {
    name: "Dr. Roberto Fernández",
    specialty: "Cardiología",
    clinic: "Hospital Corazón",
    text: "La gobernanza de IA nos da la confianza que necesitábamos para usar estas herramientas.",
    rating: 5,
  },
];

export const mockFaq = [
  {
    question: "¿MiDoc reemplaza mi trabajo como médico?",
    answer: "No. MiDoc es un asistente que automatiza documentación y sugiere diagnósticos. Tú siempre validadas y tomas las decisiones clínicas finales.",
  },
  {
    question: "¿Mis datos de pacientes son seguros?",
    answer: "Sí. Usamos encriptación HIPAA-compliant, almacenamiento en AWS, y nunca compartimos datos con terceros.",
  },
  {
    question: "¿Cuánto tarda en configurar MiDoc?",
    answer: "5 minutos. Configura tu especialidad, horarios, y listo. Las integraciones avanzan poco a poco.",
  },
  {
    question: "¿Ofrecen training?",
    answer: "Sí. Incluye webinar de onboarding, documentación, y soporte by email/chat.",
  },
  {
    question: "¿Puedo exportar mis datos?",
    answer: "Sí. Puedes descargar toda la información de pacientes en CSV o usar nuestra API.",
  },
];

export const mockFeatureDetails = [
  {
    id: "ia-clinica",
    title: "IA Clínica",
    description: "Nota SOAP automática, insights y validaciones farmacológicas para acelerar consulta.",
    bullets: ["Generación de nota en segundos", "Sugerencias con trazabilidad", "Soporte multimodal texto/voz"],
  },
  {
    id: "playbooks",
    title: "Playbooks",
    description: "8 especialidades con formularios y estructura clínica optimizada.",
    bullets: ["Plantillas por especialidad", "Campos clínicos validados", "Escalable para nuevos protocolos"],
  },
  {
    id: "gobernanza",
    title: "Gobernanza IA",
    description: "Métricas de uso, auditoría y control de decisiones de IA.",
    bullets: ["Bitácora de acciones", "Métricas por módulo", "Reportes exportables"],
  },
  {
    id: "voice-interview",
    title: "Entrevista IA por Voz",
    description: "Captura de antecedentes pre-consulta con VAD y respuestas automáticas.",
    bullets: ["Menos carga administrativa", "Mayor cobertura de anamnesis", "Experiencia guiada para paciente"],
  },
  {
    id: "whatsapp",
    title: "Integración WhatsApp",
    description: "Recordatorios y confirmaciones para reducir ausentismo.",
    bullets: ["Plantillas configurables", "Notificaciones programadas", "Seguimiento por estado de entrega"],
  },
  {
    id: "precheckin",
    title: "Pre-consulta",
    description: "Flujo híbrido IA + manual para capturar historial previo a la cita.",
    bullets: ["Menos tiempo en recepción", "Datos listos al iniciar consulta", "Mayor calidad de información"],
  },
];

export const mockFaqBilling = [
  {
    question: "¿Puedo cambiar de plan en cualquier momento?",
    answer: "Sí, puedes actualizar o cambiar de plan desde configuración y el cambio aplica en el siguiente ciclo.",
  },
  {
    question: "¿La facturación anual incluye descuento?",
    answer: "Sí. El modo anual aplica 20% de descuento en plan Pro.",
  },
  {
    question: "¿Enterprise tiene contrato mínimo?",
    answer: "Depende del volumen y de los requerimientos de integración. Se define en propuesta comercial.",
  },
];

export const mockGovernanceSeries = [
  { day: "Lun", cost: 24, calls: 43, acceptance: 74 },
  { day: "Mar", cost: 20, calls: 38, acceptance: 76 },
  { day: "Mié", cost: 27, calls: 47, acceptance: 79 },
  { day: "Jue", cost: 26, calls: 45, acceptance: 81 },
  { day: "Vie", cost: 31, calls: 53, acceptance: 78 },
  { day: "Sáb", cost: 12, calls: 20, acceptance: 84 },
  { day: "Dom", cost: 8, calls: 14, acceptance: 86 },
];
