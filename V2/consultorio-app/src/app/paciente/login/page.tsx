import type { Metadata } from "next";

import { PatientLoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Entrar — Portal del paciente"
};

export default function PatientLoginPage() {
  return <PatientLoginClient />;
}
