import { redirect } from "next/navigation";
import {
  isClinicalHistoryEnabled,
  isConsultaUnifiedEnabled,
} from "@/lib/featureFlags";

export default async function ConsultaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  if (isConsultaUnifiedEnabled() && isClinicalHistoryEnabled()) {
    const { id } = await params;
    redirect(`/medico/citas/${id}/consulta-v2`);
  }
  return <>{children}</>;
}
