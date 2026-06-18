import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { UserRole, UserStatus } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "../../../lib/auth/session-cookie";
import { validateAuthSession } from "../../../services/auth/auth-service";
import { listDoctorAccountsForAdmin } from "../../../services/platform-admin/platform-admin-service";
import { AdminDoctorsClient } from "./admin-doctors-client";

export const metadata: Metadata = {
  title: "Medicos"
};

export default async function AdminDoctorsPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await validateAuthSession(sessionToken) : null;

  if (!user || user.role !== UserRole.ADMIN) {
    redirect("/admin/login");
  }

  const [{ accounts: pendingAccounts }, { accounts: allAccounts }] = await Promise.all([
    listDoctorAccountsForAdmin(user.id, { status: UserStatus.PENDING_APPROVAL }),
    listDoctorAccountsForAdmin(user.id)
  ]);

  return (
    <AdminDoctorsClient
      initialAccounts={allAccounts}
      pendingCount={pendingAccounts.length}
    />
  );
}
