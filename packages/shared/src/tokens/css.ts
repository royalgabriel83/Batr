import { breakpoints, colors, motion, radius, shadows, spacingBasePx, typography } from "./tokens.ts";

const rootFontPx = 16;
const rem = (px: number) => `${px / rootFontPx}rem`;

/**
 * Tailwind theme variables for every token, in order. Color tokens keep
 * their ui-context.md names behind Tailwind's `--color-` prefix
 * (`--bg-base` becomes `--color-bg-base`, used as `bg-bg-base`).
 */
export function tokenThemeVariables(): [name: string, value: string][] {
  const vars: [string, string][] = [];
  vars.push(["--spacing", rem(spacingBasePx)]);
  vars.push(["--font-sans", "var(--font-inter), system-ui, sans-serif"]);
  vars.push(["--font-display", "var(--font-newsreader), Georgia, serif"]);
  for (const [name, px] of Object.entries(breakpoints)) {
    vars.push([`--breakpoint-${name}`, rem(px)]);
  }
  for (const [name, value] of Object.entries(colors)) {
    vars.push([`--color-${name}`, value]);
  }
  for (const [name, step] of Object.entries(typography)) {
    vars.push([`--text-${name}`, rem(step.size)]);
    vars.push([`--text-${name}--line-height`, rem(step.lineHeight)]);
    vars.push([`--text-${name}--font-weight`, String(step.weight)]);
    if ("tracking" in step) vars.push([`--text-${name}--letter-spacing`, `${step.tracking}em`]);
  }
  for (const [name, value] of Object.entries(radius)) {
    vars.push([`--radius-${name}`, name === "full" ? `${value}px` : rem(value)]);
  }
  for (const [name, value] of Object.entries(shadows)) {
    vars.push([`--shadow-${name}`, value]);
  }
  for (const [name, points] of Object.entries(motion.easing)) {
    vars.push([`--ease-${name}`, `cubic-bezier(${points.join(", ")})`]);
  }
  for (const [name, ms] of Object.entries(motion.duration)) {
    vars.push([`--duration-${name}`, `${ms}ms`]);
  }
  return vars;
}

/**
 * The generated `apps/web/app/tokens.css`. Tailwind's default palette,
 * type scale, radii, shadows and breakpoints are removed so only BATR
 * tokens exist.
 */
export function tokensToTailwindCss(): string {
  const lines = [
    "/* GENERATED from packages/shared/src/tokens. Do not edit by hand.",
    "   Regenerate with `pnpm tokens:write`; a test fails if it is stale. */",
    "@theme {",
    "  --color-*: initial;",
    "  --text-*: initial;",
    "  --radius-*: initial;",
    "  --shadow-*: initial;",
    "  --breakpoint-*: initial;",
    "  --ease-*: initial;",
    ...tokenThemeVariables().map(([name, value]) => `  ${name}: ${value};`),
    "}",
    "",
  ];
  return lines.join("\n");
}
