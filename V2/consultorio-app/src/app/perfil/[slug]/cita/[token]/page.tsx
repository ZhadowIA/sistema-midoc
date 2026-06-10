import { notFound } from "next/navigation";

import { getPublicAppointmentByToken } from "../../../../../services/booking/public-booking-service";
import { AppointmentClient } from "./appointment-client";

export default async function PublicAppointmentPage({
  params
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
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
    />
  );
}
