import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["dist/", "node_modules/", "*.config.js", "*.config.ts", "client/sw.js"],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended (no type-aware rules — tsc OOMs on this machine)
  ...tseslint.configs.recommended,

  // React hooks + refresh (client only)
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Disable react-refresh for hooks, contexts, and UI primitives (they correctly export non-components)
  {
    files: ["client/src/hooks/**", "client/src/App.tsx", "client/src/components/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },

  // Project-specific rules
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Agent-friendly autofixable rules
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // Runtime bug prevention
      "no-constant-condition": "error",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-fallthrough": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },

  // Disable rules that conflict with Prettier (must be last)
  eslintConfigPrettier,
);
