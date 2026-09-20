import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "artifacts/**",
    "playwright-report/**",
    ".vercel/**",
    ".netlify/**",
    "workers/data/worker-configuration.d.ts",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
