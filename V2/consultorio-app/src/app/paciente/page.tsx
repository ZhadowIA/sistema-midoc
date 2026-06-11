import type { Metadata } from "next";

import { PatientPortalClient } from "./portal-client";

export const metadata: Metadata = {
  title: "Portal del paciente"
};

export default function PatientPortalPage() {
  return <PatientPortalClient />;
}
