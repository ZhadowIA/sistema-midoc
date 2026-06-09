import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { AdminClientsConsole } from "./AdminClientsConsole";

export default async function AdminClientesPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/medico/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/medico/dashboard");
  }

  return <AdminClientsConsole />;
}
