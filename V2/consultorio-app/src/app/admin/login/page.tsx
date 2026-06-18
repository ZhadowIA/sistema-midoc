import type { Metadata } from "next";

import { AdminLoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Administrador MiDoc"
};

export default function AdminLoginPage() {
  return <AdminLoginClient />;
}
