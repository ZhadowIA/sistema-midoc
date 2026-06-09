import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MiDoc",
    short_name: "MiDoc",
    description: "Agenda y administración clínica responsiva para consultorio.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe4",
    theme_color: "#0d6b53",
    lang: "es-MX",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
