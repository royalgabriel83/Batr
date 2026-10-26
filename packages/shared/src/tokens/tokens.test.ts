import { describe, expect, it } from "vitest";
import { colors, contrastRatio, tokenThemeVariables, tokensToTailwindCss, typography } from "./index.ts";

const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

// Pairs documented in context/ui-context.md (UI Color Tokens).
const textPairs: [foreground: keyof typeof colors, background: keyof typeof colors][] = [
  ["text-primary", "bg-surface"],
  ["text-primary", "bg-base"],
  ["text-primary", "bg-subtle"],
  ["text-secondary", "bg-surface"],
  ["text-secondary", "bg-base"],
  ["text-muted", "bg-surface"],
  ["text-muted", "bg-base"],
  ["text-on-inverse", "bg-inverse"],
  ["text-on-inverse-muted", "bg-inverse"],
  ["text-on-accent", "accent-primary"],
  ["text-on-accent", "accent-primary-hover"],
  ["text-on-accent", "state-danger"],
  ["bg-inverse", "accent-on-inverse"],
  ["accent-primary", "bg-surface"],
  ["accent-primary-hover", "accent-soft"],
  ["state-success", "state-success-soft"],
  ["state-warning", "state-warning-soft"],
  ["state-danger", "state-danger-soft"],
  ["state-info", "state-info-soft"],
  ["accent-on-inverse", "bg-inverse"],
];

const nonTextPairs: [keyof typeof colors, keyof typeof colors][] = [
  ["border-strong", "bg-surface"],
  ["focus-ring", "bg-surface"],
  ["focus-ring", "bg-base"],
];

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("rejects values that are not #RRGGBB", () => {
    expect(() => contrastRatio("#FFF", "#000000")).toThrow();
  });
});

describe("color tokens", () => {
  it.each(textPairs)("%s on %s meets 4.5:1 for text", (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(nonTextPairs)("%s on %s meets 3:1 for UI components", (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("are all #RRGGBB values", () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("tokensToTailwindCss", () => {
  const vars = new Map(tokenThemeVariables());
  const css = tokensToTailwindCss();

  it("declares a theme color for every color token", () => {
    for (const [name, value] of Object.entries(colors)) {
      expect(vars.get(`--color-${name}`)).toBe(value);
    }
  });

  it("renders type sizes in rem so they follow browser font scaling", () => {
    for (const name of Object.keys(typography)) {
      expect(vars.get(`--text-${name}`)).toMatch(/rem$/);
      expect(vars.get(`--text-${name}--line-height`)).toMatch(/rem$/);
    }
    expect(vars.get("--text-body")).toBe("1rem");
    expect(vars.get("--spacing")).toBe("0.25rem");
  });

  it("removes Tailwind's default palette and declares each variable once", () => {
    expect(css).toContain("--color-*: initial;");
    const names = tokenThemeVariables().map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
  });
});
