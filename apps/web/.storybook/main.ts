import type { StorybookConfig } from "@storybook/nextjs-vite";

// Storybook for the shared components (owner, 2026-10-20). Stories sit
// next to their component as *.stories.tsx. Run with `pnpm storybook`.
const config: StorybookConfig = {
  stories: ["../components/**/*.stories.tsx"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
};

export default config;
