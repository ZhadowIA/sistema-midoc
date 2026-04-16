"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Calendar, Clock, FileText, Shield, CheckCircle2, User } from "lucide-react";
import { Button } from "@/components/Button";
import { useRouter } from "next/navigation";

type PublicDoctorCard = {
  id: string;
  name: string;
  specialty?: string | null;
  slug?: string | null;
  bio?: string | null;
  profileImage?: string | null;
};

export default function PatientLanding() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<PublicDoctorCard[]>([]);

  useEffect(() => {
    fetch("/api/public/doctors")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setDoctors(data);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-6 py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/20 -z-10" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mb-8"
          >
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Atención médica profesional</span>
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-semibold text-foreground mb-6 leading-tight">
            Cuidado médico de
            <span className="text-primary block mt-2">excelencia</span>
          </h1>

          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Agenda tu consulta de manera rápida y sencilla. Atención personalizada con los más altos estándares de calidad.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button size="lg" onClick={() => router.push("/agendar")}>
              Agendar cita
            </Button>
            <Button size="lg" variant="secondary">
              Conoce más
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Nuestros Médicos Section */}
      {doctors.length > 0 && (
        <section className="px-6 py-20">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-semibold text-foreground mb-4">
                Nuestros Especialistas
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Conoce al equipo médico altamente calificado para atenderte
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {doctors.map((doc, index) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.6 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-all group flex flex-col"
                >
                  <div className="p-6 flex flex-col items-center flex-1">
                    <div className="w-24 h-24 rounded-full overflow-hidden mb-4 bg-secondary">
                      {doc.profileImage ? (
                        <img src={doc.profileImage} alt={doc.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-xl font-bold">{doc.name.substring(0, 2).toUpperCase()}</div>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-1">{doc.name}</h3>
                    <div className="text-sm font-medium text-primary mb-3">{doc.specialty || "Médico Especialista"}</div>
                    {doc.bio && <p className="text-sm text-muted-foreground text-center line-clamp-3">{doc.bio}</p>}
                  </div>
                  <div className="p-4 border-t border-border bg-secondary/10">
                    <Button 
                      fullWidth 
                      variant="secondary"
                      onClick={() => router.push(`/agendar?doctor=${doc.slug || ""}`)}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Agendar con este médico
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Process Section */}
      <section className="px-6 py-24 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Proceso simple y claro
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              En solo 3 pasos podrás tener tu consulta agendada
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Calendar,
                title: "Selecciona fecha y hora",
                description: "Elige el día y horario que mejor se ajuste a tu disponibilidad"
              },
              {
                icon: FileText,
                title: "Completa tus datos",
                description: "Ingresa tu información personal y el tipo de consulta que necesitas"
              },
              {
                icon: CheckCircle2,
                title: "Recibe confirmación",
                description: "Te enviaremos la confirmación de tu cita y podrás completar un cuestionario opcional"
              }
            ].map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-shadow"
              >
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                  <step.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-semibold text-foreground mb-4">
              ¿Por qué elegirnos?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Nos comprometemos con tu salud y bienestar
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Clock,
                title: "Horarios flexibles",
                description: "Amplia disponibilidad para adaptarnos a tu agenda"
              },
              {
                icon: Shield,
                title: "Atención profesional",
                description: "Médicos certificados con años de experiencia"
              },
              {
                icon: FileText,
                title: "Seguimiento personalizado",
                description: "Cuestionario clínico previo para mejor atención"
              },
              {
                icon: Calendar,
                title: "Gestión fácil",
                description: "Agenda, reagenda o cancela tu cita cuando lo necesites"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="flex gap-4 p-6 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-24 bg-gradient-to-br from-primary/10 via-secondary/20 to-primary/5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-4xl font-semibold text-foreground mb-6">
            ¿Listo para tu consulta?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Agenda tu cita ahora y recibe atención médica de calidad
          </p>
          <Button size="lg" onClick={() => router.push("/agendar")}>
            Agendar cita ahora
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-border">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p>© 2026 Consultorio Médico. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
