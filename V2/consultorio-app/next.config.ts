import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

// En Vercel (despliegue de pruebas) se deja que Next infiera la raiz del monorepo:
// el adaptador de Vercel calcula las rutas de salida contra la raiz del repo, y fijar
// aqui este subdir lo hace buscar `.next` en la raiz (`/vercel/path0/.next`).
const dockerBuild: NextConfig = process.env.VERCEL
  ? {}
  : {
      // Salida autocontenida para una imagen Docker ligera (se ejecuta `node server.js`).
      output: "standalone",
      // El standalone traza dependencias desde la raiz del proyecto (este subdir del monorepo).
      outputFileTracingRoot: configDirectory,
      turbopack: {
        root: configDirectory
      }
    };

const nextConfig: NextConfig = {
  ...dockerBuild
};

export default nextConfig;
