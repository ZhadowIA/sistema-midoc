import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Salida autocontenida para una imagen Docker ligera (se ejecuta `node server.js`).
  output: "standalone",
  // El standalone traza dependencias desde la raiz del proyecto (este subdir del monorepo).
  outputFileTracingRoot: configDirectory,
  turbopack: {
    root: configDirectory
  }
};

export default nextConfig;
