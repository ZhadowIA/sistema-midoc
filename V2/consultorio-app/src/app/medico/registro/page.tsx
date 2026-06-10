import type { Metadata } from "next";

import { RegistroClient } from "./registro-client";

export const metadata: Metadata = {
  title: "Registro"
};

export default function RegistroPage() {
  return <RegistroClient />;
}
