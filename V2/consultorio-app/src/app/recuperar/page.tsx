import type { Metadata } from "next";
import { Suspense } from "react";

import { RecuperarClient } from "./recuperar-client";

export const metadata: Metadata = {
  title: "Recuperar cuenta"
};

export default function RecuperarPage() {
  return (
    <Suspense>
      <RecuperarClient />
    </Suspense>
  );
}
