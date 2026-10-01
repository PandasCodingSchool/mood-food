// OKLCH → sRGB. The design defines every accent in OKLCH so all four mood hues
// share lightness and chroma (contrast stays constant as the mood changes).
// React Native can't parse oklch(), so we resolve to hex/rgba at theme build time.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** l in 0..1, c chroma (~0..0.4), h hue in degrees. Out-of-gamut values are clamped. */
export function oklchToRgb(l: number, c: number, h: number): RGB {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  const lr = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const lg = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const lb = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  return {
    r: Math.round(clamp01(linearToSrgb(lr)) * 255),
    g: Math.round(clamp01(linearToSrgb(lg)) * 255),
    b: Math.round(clamp01(linearToSrgb(lb)) * 255),
  };
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
}

export function oklch(l: number, c: number, h: number, alpha = 1): string {
  const rgb = oklchToRgb(l, c, h);
  return alpha >= 1 ? rgbToHex(rgb) : `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/** Applies alpha to a #RRGGBB colour. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Tile / avatar / badge colour used across games, quests and notifications. */
export const hueTile = (hue: number) => oklch(0.8, 0.12, hue);
