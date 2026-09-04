import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Lint de la app del medico. El portal ya se lintaba desde el paso 0; el
 * escritorio no, pese a que la regla 8 (Definition of Done) exige lint limpio
 * en todo cambio. Mismo criterio que el portal: recomendado de JS y de
 * TypeScript, mas las reglas de hooks de React.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/target/**",
      "scripts/medication-reference/build/**",
      // Canvas de diseño (artefacto de una herramienta, no fuente nuestra). La
      // remediacion lo mueve a `V2/design-propuesta/` en otra rama; el ignore
      // queda inerte cuando esa carpeta ya no este aqui.
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
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    // Scripts de build y pipeline de medicamentos: corren en Node, no en el webview.
    files: ["scripts/**/*.{ts,mjs}", "*.config.{ts,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node
    }
  }
);
