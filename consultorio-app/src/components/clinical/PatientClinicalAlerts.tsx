"use client";

import { useEffect, useState } from "react";
import { ClinicalAlertsBar } from "./ClinicalAlertsBar";

type Payload = {
  allergies?: Array<Record<string, unknown>>;
  alerts?: Array<Record<string, unknown>>;
};

type Props = {
  patientId: string | null | undefined;
  className?: string;
};

export function PatientClinicalAlerts({ patientId, className }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    fetch(`/api/admin/patients/${patientId}/clinical-history`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPayload((data.record?.payload ?? null) as Payload | null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (!payload) return null;
  const allergies = Array.isArray(payload.allergies) ? payload.allergies : [];
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  if (allergies.length === 0 && alerts.length === 0) return null;

  return (
    <div className={className}>
      <ClinicalAlertsBar alerts={alerts} allergies={allergies} />
    </div>
  );
}
