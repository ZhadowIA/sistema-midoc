import { EncounterClient } from "./encounter-client";

export default async function EncounterPage({
  params
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;

  return <EncounterClient appointmentId={appointmentId} />;
}
