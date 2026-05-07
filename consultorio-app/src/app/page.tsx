"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, AlertCircle, Brain, Stethoscope, FileText, BarChart3, Lock, Zap, Calendar, ClipboardList, Layers, Sparkles } from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "SOAP en 90 segundos",
    desc: "Transcribe audio o texto. IA estructura la nota completa. Valida contra criterios clínicos.",
  },
  {
    icon: Brain,
    title: "Insights clínicos trazables",
    desc: "Diagnósticos sugeridos con razonamiento. Cada decisión IA queda registrada para auditoría.",
  },
  {
    icon: Stethoscope,
    title: "Playbooks por especialidad",
    desc: "8 especialidades con campos validados y flujos clínicos optimizados.",
  },
  {
    icon: Lock,
    title: "Gobernanza HIPAA",
    desc: "Encriptación end-to-end. AWS GxP. Exporta datos cuando necesites.",
  },
  {
    icon: Zap,
    title: "Confirmación automática",
    desc: "WhatsApp confirm → 40% menos no-shows. SMS recordatorios ajustables.",
  },
  {
    icon: BarChart3,
    title: "Dashboard operacional",
    desc: "KPIs clínicos: no-shows, adopción IA, ingresos. Reportes por doctor.",
  },
];

const TESTIMONIALS = [
  {
    name: "Dr. Javier López",
    role: "Medicina Familiar",
    text: "Documentar SOAP me tomaba 20 min. Ahora 3 minutos. La IA sugiere diagnósticos que nunca paso por alto.",
    stat: "2h menos/día en docs",
  },
  {
    name: "Dra. Elena García",
    role: "Pediatría",
    text: "La entrevista por voz capta lo que el paciente olvidaría. Los padres hablan más cuando no hay presión de escribir.",
    stat: "70% mejor info de paciente",
  },
  {
    name: "Dr. Roberto Fernández",
    role: "Cardiología",
    text: "Sabemos exactamente qué sugirió IA en cada caso. Eso nos da seguridad legal y clínica.",
    stat: "100% trazabilidad",
  },
];

const FAQS = [
  {
    q: "¿MiDoc reemplaza mi criterio médico?",
    a: "No. Eres tú quien valida y decide. MiDoc acelera documentación y sugiere hipótesis. Tú siempre tienes el control clínico final.",
  },
  {
    q: "¿Cómo garantizan confidencialidad?",
    a: "HIPAA compliance, encriptación AES-256, almacenamiento AWS con audit logs. Nunca vendemos datos. Puedes exportar cuando quieras.",
  },
  {
    q: "¿Cuánto tarda integrar?",
    a: "5 minutos: especialidad, horarios, celular. Las integraciones WhatsApp/pagos se activan sobre demanda.",
  },
  {
    q: "¿Funciona sin conexión?",
    a: "Guardas borradores offline. Se sincronizan cuando vuelve conexión.",
  },
];

function FaqItem({ item }: { item: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left font-semibold text-foreground hover:text-primary transition-colors"
      >
        {item.q}
        <span
          className="text-muted-foreground transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          ▾
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pb-4 text-sm text-muted-foreground leading-relaxed overflow-hidden"
          >
            {item.a}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MarketingLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Top Nav */}
      <header className="sticky top-0 z-30 bg-slate-950 md:bg-white/90 backdrop-blur border-b border-slate-800/80 md:border-border w-full">
        <div className="w-full max-w-7xl mx-auto px-6 py-3 flex items-center justify-between bg-slate-950 md:bg-transparent">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center text-white text-sm font-bold bg-primary">
              M
            </div>
            <span className="font-bold text-lg text-slate-100 md:text-foreground">MiDoc</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {[
              { label: "Funcionalidades", href: "#features" },
              { label: "Precios", href: "#pricing" },
              { label: "Para pacientes", href: "/paciente" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/medico/login"
              className="px-4 py-2 rounded-md text-sm font-semibold text-slate-200 md:text-foreground hover:bg-slate-800/70 md:hover:bg-secondary transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/medico/registro"
              className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-primary hover:bg-primary-hover transition-colors"
            >
              Gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-secondary/30 to-background py-24 lg:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-primary text-xs font-semibold">
                ✓ 1,200+ médicos en 8 países · Desde 2024
              </div>

              <div>
                <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                  Documentación clínica en segundos
                </h1>
                <p className="text-xl text-muted-foreground mt-6 max-w-xl">
                  SOAP automática. Insights IA con trazabilidad completa. Gobernanza clínica que te da confianza legal y médica.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-4">
                <Link
                  href="/medico/registro"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-md font-semibold text-white bg-primary hover:bg-primary-hover transition-colors"
                >
                  Comenzar gratis <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center px-6 py-3 rounded-md font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
                >
                  Cómo funciona
                </a>
              </div>

              <div className="grid grid-cols-3 gap-8 pt-12">
                {[
                  { label: "Menos documentación", value: "2h/día" },
                  { label: "Adopción de insights", value: "70%" },
                  { label: "Especialidades", value: "8" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-2xl font-bold text-primary">{value}</p>
                    <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-24">
        <div className="space-y-16">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">Todo lo que necesitas en consulta</h2>
            <p className="text-muted-foreground text-lg">Una plataforma que cubre el flujo clínico completo, de la cita a la documentación.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="group relative bg-card border border-border rounded-lg p-6 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <div className="w-10 h-10 rounded-md bg-blue-50 flex items-center justify-center text-primary mb-4 group-hover:bg-blue-100 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-secondary/30 border-y border-border py-24">
        <div className="max-w-6xl mx-auto px-6 space-y-16">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">Lo que dicen los médicos</h2>
            <p className="text-muted-foreground text-lg">Médicos que confían en MiDoc cada día.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-lg p-6 space-y-4"
              >
                <p className="text-foreground leading-relaxed italic">"{t.text}"</p>
                <div className="space-y-2 pt-4 border-t border-border">
                  <p className="font-semibold text-foreground text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                  <p className="text-xs font-semibold text-primary pt-1">{t.stat}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-24 space-y-16">
        <div className="space-y-4 text-center">
          <h2 className="text-4xl font-bold">Elige tu punto de entrada</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Tres planes base para diferentes necesidades. La IA se activa como complemento modular.
          </p>
        </div>

        {/* Base Plans */}
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          {/* Plan Agenda */}
          <div className="bg-card border border-border rounded-md p-8 space-y-6 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Agenda</h3>
                <p className="text-xs text-muted-foreground">Para clínicas que necesitan agendamiento</p>
              </div>
            </div>

            <div className="pt-1">
              <div className="text-3xl font-bold text-foreground">$299 <span className="text-base font-normal text-muted-foreground">MXN/mes</span></div>
            </div>

            <Link
              href="/medico/registro"
              className="block w-full text-center py-2.5 rounded-md font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
            >
              Comenzar
            </Link>

            <ul className="space-y-2.5">
              {[
                "Agenda en línea con página pública",
                "Recordatorios y confirmaciones WhatsApp",
                "Lista de espera automática",
                "Cuestionarios pre-consulta",
                "Panel de recepción y operación",
              ].map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Plan Clínico */}
          <div className="bg-card border border-border rounded-md p-8 space-y-6 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Clínico</h3>
                <p className="text-xs text-muted-foreground">Para médicos enfocados en expediente</p>
              </div>
            </div>

            <div className="pt-1">
              <div className="text-3xl font-bold text-foreground">$449 <span className="text-base font-normal text-muted-foreground">MXN/mes</span></div>
            </div>

            <Link
              href="/medico/registro"
              className="block w-full text-center py-2.5 rounded-md font-semibold border border-border text-foreground hover:bg-secondary transition-colors"
            >
              Comenzar
            </Link>

            <ul className="space-y-2.5">
              {[
                "Expediente clínico completo",
                "Historia médica y antecedentes",
                "Notas SOAP estructuradas",
                "Recetas y prescripciones",
                "Firma y cierre de consulta",
              ].map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Plan Integral — destacado */}
          <div className="relative bg-card border border-primary rounded-md overflow-hidden shadow-lg">
            <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 text-center tracking-wide">
              RECOMENDADO PARA CLÍNICAS
            </div>
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Integral</h3>
                  <p className="text-xs text-muted-foreground">Agenda + sistema clínico completo</p>
                </div>
              </div>

              <div className="pt-1">
                <div className="text-3xl font-bold text-foreground">$599 <span className="text-base font-normal text-muted-foreground">MXN/mes</span></div>
              </div>

              <Link
                href="/medico/registro"
                className="block w-full text-center py-2.5 rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                Suscribirse
              </Link>

              <ul className="space-y-2.5">
                {[
                  "Todo de Agenda +",
                  "Expediente clínico completo",
                  "Historia médica y antecedentes",
                  "Notas SOAP estructuradas",
                  "Recetas y prescripciones",
                  "Firma y cierre de consulta",
                ].map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-foreground">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Add-ons IA */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold text-foreground">Capacidades de IA</h3>
            </div>
            <div className="flex-1 border-t border-border" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Se añaden a cualquier plan base</span>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {[
              {
                name: "IA Esencial",
                code: "AI_30",
                price: "$359",
                consultas: "126 consultas IA/mes",
                pct: "30% de tu práctica",
                desc: "Ideal para comenzar con IA en consultas seleccionadas.",
              },
              {
                name: "IA Pro",
                code: "AI_60",
                price: "$669",
                consultas: "252 consultas IA/mes",
                pct: "60% de tu práctica",
                desc: "Para médicos con alto volumen que quieren IA en la mayoría de citas.",
              },
              {
                name: "IA Ilimitada",
                code: "AI_100",
                price: "$999",
                consultas: "420 consultas IA/mes",
                pct: "100% de tu práctica",
                desc: "Acceso completo. Sin restricciones de volumen mensual.",
              },
            ].map((addon) => (
              <div key={addon.code} className="bg-secondary/20 border border-border rounded-md p-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-foreground">{addon.name}</h4>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">{addon.pct}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{addon.desc}</p>
                </div>

                <div>
                  <div className="text-2xl font-bold text-foreground">{addon.price} <span className="text-sm font-normal text-muted-foreground">MXN/mes</span></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{addon.consultas}</p>
                </div>

                <ul className="space-y-1.5">
                  {[
                    "Transcripción de audio clínico",
                    "SOAP estructurada automáticamente",
                    "Insights diagnósticos trazables",
                    "Entrevista IA al paciente",
                    "Validación farmacológica",
                  ].map((f) => (
                    <li key={f} className="flex gap-2 text-xs text-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Los add-ons de IA requieren Plan Clínico o Plan Integral como base.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/30 border-y border-border py-24">
        <div className="max-w-3xl mx-auto px-6 space-y-12">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">Preguntas frecuentes</h2>
            <p className="text-muted-foreground">Respuestas a lo que pregunta cada médico.</p>
          </div>

          <div className="divide-y divide-border">
            {FAQS.map((item) => (
              <FaqItem key={item.q} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white py-20 px-6">
        <div className="max-w-2xl mx-auto space-y-8 text-center">
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">¿Listo para transformar tu consulta?</h2>
            <p className="text-primary-foreground/90">Comienza gratis hoy. Sin tarjeta. Configura en 5 minutos.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/medico/registro"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-md font-semibold bg-white text-primary hover:bg-gray-100 transition-colors"
            >
              Comenzar gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/paciente"
              className="inline-flex items-center justify-center px-8 py-3 rounded-md font-semibold border border-white/30 hover:bg-white/10 transition-colors"
            >
              Soy paciente
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-10 bg-card">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold bg-primary">
              M
            </div>
            <span className="font-semibold text-foreground">MiDoc</span>
          </div>
          <p>© 2026 MiDoc. Todos los derechos reservados.</p>
          <div className="flex gap-4">
            <Link href="/privacidad" className="hover:text-foreground transition-colors">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-foreground transition-colors">
              Términos
            </Link>
            <Link href="/medico/login" className="hover:text-foreground transition-colors">
              Acceso médicos
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
