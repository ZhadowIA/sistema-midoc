import type { Metadata } from "next";

import { PatientRegisterClient } from "./registro-client";

export const metadata: Metadata = {
  title: "Crear cuenta — Portal del paciente"
};

export default function PatientRegisterPage() {
  return <PatientRegisterClient />;
}
