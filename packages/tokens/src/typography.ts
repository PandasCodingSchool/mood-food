// Type system: Bricolage Grotesque for display, Geist for UI text, Geist Mono for
// eyebrow labels. Family names match the keys @moodfood/ui registers with expo-font;
// each weight is its own family (React Native can't synthesise weights reliably).

export const fontFamily = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemibold: 'Geist_600SemiBold',
  bodyBold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  iconOutlined: 'MaterialSymbolsRounded-Outlined',
  iconFilled: 'MaterialSymbolsRounded-Filled',
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase';
}

/** em-based tracking from the design → absolute points for React Native. */
const t = (
  family: string,
  size: number,
  lineHeight: number,
  trackingEm = 0,
  upper = false,
): TextStyleToken => ({
  fontFamily: family,
  fontSize: size,
  lineHeight: Math.round(size * lineHeight * 10) / 10,
  letterSpacing: Math.round(size * trackingEm * 100) / 100,
  ...(upper ? { textTransform: 'uppercase' as const } : {}),
});

export const textStyles = {
  // Display (Bricolage Grotesque)
  display64: t(fontFamily.displayHeavy, 64, 0.9, -0.04), // streak count
  display44: t(fontFamily.displayHeavy, 44, 0.98, -0.035), // swipe result
  display40: t(fontFamily.display, 40, 0.98, -0.035), // home hero
  display36: t(fontFamily.display, 36, 1, -0.03), // screen titles
  display34: t(fontFamily.display, 34, 1.05, -0.025), // launch, onboarding
  display32: t(fontFamily.display, 32, 1.02, -0.03),
  display30: t(fontFamily.display, 30, 1.02, -0.03), // meal detail
  display28: t(fontFamily.display, 28, 1.02, -0.025), // hero card dish
  display26: t(fontFamily.display, 26, 1.1, -0.02), // stats, mood read-out
  title21: t(fontFamily.display, 21, 1.15, -0.02), // section headers
  title19: t(fontFamily.display, 19, 1.15, -0.02),
  title17: t(fontFamily.display, 17, 1.2, -0.015), // game tiles

  // Body (Geist)
  button16: t(fontFamily.bodySemibold, 16, 1.2),
  button15: t(fontFamily.bodySemibold, 15, 1.2),
  button13: t(fontFamily.bodySemibold, 13, 1.2),
  bodyStrong16: t(fontFamily.bodySemibold, 16, 1.25),
  bodyStrong15: t(fontFamily.bodySemibold, 15, 1.25),
  bodyStrong14: t(fontFamily.bodySemibold, 14.5, 1.3),
  body15: t(fontFamily.body, 15, 1.45),
  body14: t(fontFamily.body, 14.5, 1.45),
  body13: t(fontFamily.body, 13.5, 1.4),
  caption13: t(fontFamily.body, 13, 1.35),
  caption12: t(fontFamily.body, 12.5, 1.35),
  micro12: t(fontFamily.body, 12, 1.35),
  micro11: t(fontFamily.body, 11.5, 1.3),
  tab: t(fontFamily.bodySemibold, 10.5, 1.2),
  chip12: t(fontFamily.bodyBold, 12, 1.2),
  chip11: t(fontFamily.bodyBold, 11.5, 1.2),

  // Eyebrow labels (Geist Mono, uppercase, tracked)
  label: t(fontFamily.mono, 10.5, 1.3, 0.08, true),
  labelSmall: t(fontFamily.mono, 10, 1.3, 0.08, true),
  code: t(fontFamily.monoMedium, 22, 1.2, 0.08),
} as const;

export type TextVariant = keyof typeof textStyles;
