import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Lint de la app del medico. El portal se lintaba desde el paso 0 y el
 * escritorio no, pese a que la regla 8 (Definition of Done) exige lint limpio
 * en todo cambio. Mismo criterio que el portal: recomendado de JS y de
 * TypeScript, mas las reglas de hooks de React.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
      "scripts/medication-reference/build/**",
      // Canvas de diseño exportado por una herramienta, no es fuente nuestra.
      "Rediseño interfaz aplicación médica/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // REGLAS §3: prohibido `any` salvo justificacion en comentario.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    // Pruebas, scripts de build y pipelines de datos: corren en Node.
    files: ["src/**/*.test.ts", "scripts/**/*.{ts,mjs,js}", "*.config.{ts,mjs,js}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node
    }
  }
);
