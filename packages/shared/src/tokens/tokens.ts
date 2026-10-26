// Design tokens for BATR. Values come from context/ui-context.md
// (UI Color Tokens, Typography, Spacing, Borders and Radius,
// Elevation), where they are marked PENDING APPROVAL. Change that file
// first, with the owner's approval, then this one.
//
// These are interface colors. They are not logo colors: the logo is
// used as supplied and never recolored to match them.

export const colors = {
  "bg-base": "#F6F8F7",
  "bg-surface": "#FFFFFF",
  "bg-subtle": "#EEF2F0",
  "bg-inverse": "#021B18",
  "text-primary": "#012921",
  "text-secondary": "#4A5A56",
  "text-muted": "#5B6B67",
  "text-on-inverse": "#F9F8F6",
  "text-on-inverse-muted": "#A8B5B1",
  "text-on-accent": "#FFFFFF",
  "border-default": "#DFE5E3",
  "border-strong": "#8A9894",
  "accent-primary": "#037551",
  "accent-primary-hover": "#025C40",
  "accent-on-inverse": "#4CD27B",
  "accent-soft": "#E7F6EE",
  "focus-ring": "#037551",
  "state-success": "#037551",
  "state-success-soft": "#E7F6EE",
  "state-warning": "#93370D",
  "state-warning-soft": "#FFFAEB",
  "state-danger": "#B42318",
  "state-danger-soft": "#FEF3F2",
  "state-info": "#175CD3",
  "state-info-soft": "#EFF8FF",
} as const;

export type ColorToken = keyof typeof colors;

// Font sizes and line heights in px (rendered as rem so they follow
// the reader's browser font size). Tracking is in em. `display` and
// `h2` have a larger step from the `md` breakpoint (`display-lg`,
// `h2-lg`), as the owner-approved direction sets (2026-10-17).
// `display`, `display-lg`, `h1`, `h2` and `h2-lg` are set in the
// display serif (`font-display`, PROPOSED 2026-10-17, pending the
// owner's visual approval); everything else is Inter.
export const typography = {
  display: { size: 44, lineHeight: 46, weight: 400, tracking: -0.02 },
  "display-lg": { size: 68, lineHeight: 68, weight: 400, tracking: -0.025 },
  h1: { size: 34, lineHeight: 40, weight: 400, tracking: -0.015 },
  h2: { size: 28, lineHeight: 34, weight: 400, tracking: -0.01 },
  "h2-lg": { size: 40, lineHeight: 44, weight: 400, tracking: -0.015 },
  h3: { size: 20, lineHeight: 28, weight: 600 },
  h4: { size: 18, lineHeight: 28, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  "body-sm": { size: 14, lineHeight: 20, weight: 400 },
  caption: { size: 12, lineHeight: 16, weight: 500 },
} as const satisfies Record<string, { size: number; lineHeight: number; weight: number; tracking?: number }>;

export type TypographyToken = keyof typeof typography;

// 4px base. Steps 0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40,
// 12=48, 16=64 are the documented scale.
export const spacingBasePx = 4;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

// Shadows are tinted with the ink color, never pure black.
export const shadows = {
  sm: "0 1px 2px rgba(2, 27, 24, 0.06)",
  card: "0 1px 2px rgba(2, 27, 24, 0.04), 0 4px 16px rgba(2, 27, 24, 0.05)",
  "card-hover": "0 2px 4px rgba(2, 27, 24, 0.05), 0 12px 28px rgba(2, 27, 24, 0.10)",
  lg: "0 12px 32px rgba(2, 27, 24, 0.16)",
} as const;

export type ShadowToken = keyof typeof shadows;

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const contentMaxWidthPx = 1280;

// Motion (ui-context.md, Motion). Durations in ms; easings as CSS
// cubic-bezier control points so Motion and CSS share them. Everything
// that moves also stops for prefers-reduced-motion.
export const motion = {
  duration: { fast: 150, base: 220, slow: 360, exchange: 520 },
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.3, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
  },
  /** How long an auto-advancing carousel shows each slide. */
  carouselIntervalMs: 5000,
} as const satisfies {
  duration: Record<string, number>;
  easing: Record<string, readonly [number, number, number, number]>;
  carouselIntervalMs: number;
};

// Minimum touch target (ui-context.md, Buttons and Accessibility).
export const minTouchTargetPx = 44;
