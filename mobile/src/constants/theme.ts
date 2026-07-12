export const gradients = {
  orange: ['#f97316', '#fbbf24'] as const,
  orangeDeep: ['#f97316', '#fb923c', '#fbbf24'] as const,
  purple: ['#7c3aed', '#a78bfa'] as const,
  cyan: ['#0891b2', '#22d3ee'] as const,
  green: ['#16a34a', '#4ade80'] as const,
  greenDeep: ['#14532d', '#16a34a'] as const,
  greenDark: ['#065f46', '#064e3b'] as const,
  rose: ['#e11d48', '#fb7185'] as const,
  indigo: ['#1e1b4b', '#312e81'] as const,
  amber: ['#7c2d12', '#f97316'] as const,
  amberFull: ['#7c2d12', '#f97316', '#fbbf24'] as const,
  cyanDark: ['#0c4a6e', '#0891b2'] as const,
  successMint: ['#f0fdf4', '#dcfce7', '#bbf7d0'] as const,
  successBadge: ['#22c55e', '#4ade80'] as const,
  night: ['#1e293b', '#334155'] as const,
  nightDeep: ['#0f172a', '#1e293b', '#334155'] as const,
  cream: ['#fff5eb', '#ffffff'] as const,
};

export const cardGradients = [
  ['#dc2626', '#f97316'],
  ['#f97316', '#fbbf24'],
  ['#16a34a', '#4ade80'],
  ['#0d9488', '#34d399'],
  ['#9333ea', '#c084fc'],
  ['#1e40af', '#60a5fa'],
  ['#92400e', '#d97706'],
  ['#b45309', '#f59e0b'],
] as const;

export const colors = {
  navy: '#1a1a2e',
  cream: '#fff5eb',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate300: '#cbd5e1',
  orange: '#f97316',
  orangeLight: '#fb923c',
  amber: '#fbbf24',
  purple: '#7c3aed',
  purpleLight: '#a78bfa',
  cyan: '#0891b2',
  cyanLight: '#22d3ee',
  green: '#16a34a',
  greenLight: '#4ade80',
  rose: '#e11d48',
  red: '#ef4444',
  blue: '#3b82f6',
  white: '#ffffff',
};

export const gameCardGradients: Record<string, readonly [string, string]> = {
  character: ['#7c3aed', '#a78bfa'],
  story: ['#0891b2', '#22d3ee'],
  quiz: ['#f97316', '#fbbf24'],
  swipe: ['#e11d48', '#fb7185'],
  wheel: ['#16a34a', '#4ade80'],
};

const FONT_FAMILIES: Record<number, string> = {
  400: 'Nunito_400Regular',
  600: 'Nunito_600SemiBold',
  700: 'Nunito_700Bold',
  800: 'Nunito_800ExtraBold',
  900: 'Nunito_900Black',
};

/** Nunito ships as separate weight files — use fontFamily instead of fontWeight. */
export function fw(weight: 400 | 600 | 700 | 800 | 900) {
  return { fontFamily: FONT_FAMILIES[weight] };
}
