import { notFound } from "next/navigation";

import { getPublicDoctorProfile } from "../../../../services/doctor/doctor-profile-service";
import { BookingClient } from "./booking-client";

function nextDateString() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default async function BookingPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicDoctorProfile(slug);

  if (!profile) {
    notFound();
  }

  return (
    <section className="public-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Agenda publica</span>
          <h2>{profile.doctor.professionalName}</h2>
        </div>

        <BookingClient profile={profile} initialDate={nextDateString()} />
      </article>
    </section>
  );
}
