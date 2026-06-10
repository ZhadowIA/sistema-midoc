import type { Metadata } from "next";

import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Iniciar sesion"
};

export default function LoginPage() {
  return <LoginClient />;
}
