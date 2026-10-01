// Spacing, radii, shadows and motion from the MoodFood 2.0 design.

export const space = {
  /** Horizontal gutter for cards and rails. */
  gutter: 16,
  /** Horizontal padding for headings and copy. */
  page: 20,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  /** Hero cards, sheets, swipe cards. */
  card: 30,
  pill: 999,
} as const;

/**
 * CSS box-shadow strings. React Native (new architecture) accepts these via the
 * `boxShadow` style prop, including negative spread.
 */
export const shadow = {
  hero: '0px 30px 60px -28px rgba(0,0,0,0.6)',
  card: '0px 20px 40px -24px rgba(0,0,0,0.4)',
  sheet: '0px -10px 40px -20px rgba(0,0,0,0.45)',
  float: '0px 20px 40px -18px rgba(0,0,0,0.5)',
  small: '0px 8px 16px -8px rgba(0,0,0,0.35)',
  segment: '0px 4px 12px -6px rgba(0,0,0,0.35)',
  /** Accent glow under primary buttons; pass the accent colour. */
  glow: (color: string) => `0px 16px 30px -14px ${color}`,
} as const;

/** Cubic-bezier control points, usable with Reanimated `Easing.bezier(...)`. */
export const easing = {
  /** Screen/section enter. */
  enter: [0.2, 0.8, 0.2, 1],
  /** Overshooting pop for badges, results, the launch logo. */
  pop: [0.2, 0.9, 0.3, 1.2],
  /** Swipe card fly-out. */
  swipe: [0.4, 0, 0.6, 1],
  /** Roulette wheel deceleration. */
  spin: [0.12, 0.7, 0.18, 1],
  standard: [0.4, 0, 0.2, 1],
} as const;

export const duration = {
  fast: 200,
  base: 250,
  swipe: 300,
  enter: 400,
  pop: 600,
  launch: 2700,
  spin: 3800,
  toast: 1900,
} as const;

/** Ambient loop timings (ms). */
export const ambient = {
  orbDrift: [14000, 18000],
  fog: [16000, 22000],
  sunPulse: 7000,
  lightning: 7000,
  orbPulse: 3000,
  float: 5000,
  shimmer: 4500,
  rainDrops: 34,
} as const;
