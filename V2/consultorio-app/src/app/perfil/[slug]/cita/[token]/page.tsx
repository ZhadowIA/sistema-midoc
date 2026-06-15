import { notFound } from "next/navigation";

import { getPublicAppointmentByToken } from "../../../../../services/booking/public-booking-service";
import { AppointmentClient } from "./appointment-client";

export default async function PublicAppointmentPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ accion?: string }>;
}) {
  const { slug, token } = await params;
  const { accion } = await searchParams;
  const details = await getPublicAppointmentByToken(token);

  if (!details) {
    notFound();
  }

  return (
    <AppointmentClient
      token={token}
      slug={slug}
      serviceId={details.appointment.serviceId}
      details={details}
      cancelIntent={accion === "cancelar"}
    />
  );
}
