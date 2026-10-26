import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const webFiles = ["apps/web/**/*.{ts,tsx}"];
const mobileFiles = ["apps/mobile/**/*.{ts,tsx}"];
const appFiles = [...webFiles, ...mobileFiles];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/next-env.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/coverage/**",
      "**/storybook-static/**",
      "**/.expo/**",
      "**/dist-web/**",
      "supabase/.temp/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // Next.js rules apply to the web app only. Its ignore-only entries are
  // dropped; the ignores above cover the same build output.
  ...[...nextCoreWebVitals, ...nextTypescript]
    .filter((config) => Object.keys(config).some((key) => key !== "ignores"))
    .map((config) => ({ ...config, files: webFiles })),
  {
    files: webFiles,
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      // The app uses the App Router only; this rule checks a pages/ directory.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // The mobile app (Milestone 2): the rules of hooks, as the web gets
  // them through eslint-config-next.
  {
    files: mobileFiles,
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Design values come only from tokens (code-standards.md, Styling):
  // no raw hex colors and no pixel font sizes in app code.
  {
    files: appFiles,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\\b/i]",
          message: "Use a design token from packages/shared instead of a raw hex color.",
        },
        {
          selector: "TemplateElement[value.raw=/#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\\b/i]",
          message: "Use a design token from packages/shared instead of a raw hex color.",
        },
        {
          selector: "Literal[value=/\\btext-\\[[0-9.]+(px|rem|em)\\]/]",
          message: "Use a typography token (text-body, text-h1, ...) instead of an arbitrary font size.",
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
);
