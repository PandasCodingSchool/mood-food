import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { fontFamily, textStyles, type TextVariant } from '@moodfood/tokens';
import { glyphs, type IconName } from './glyphs';
import { useTheme } from './theme';
import type { ThemeColors } from '@moodfood/tokens';

export type Tone = keyof ThemeColors | 'white' | 'photo2';

export function useToneColor(tone: Tone | undefined): string | undefined {
  const { colors } = useTheme();
  if (!tone) return undefined;
  if (tone === 'white') return '#FFFFFF';
  if (tone === 'photo2') return 'rgba(255,255,255,0.78)';
  return colors[tone];
}

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: Tone;
  /** Overrides tone with an explicit colour. */
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body15', tone = 'ink', color, align, style, ...rest }: TextProps) {
  const toneColor = useToneColor(tone);
  return (
    <RNText
      {...rest}
      style={[textStyles[variant] as TextStyle, { color: color ?? toneColor, textAlign: align }, style]}
    />
  );
}

export interface IconProps {
  name: IconName;
  size?: number;
  tone?: Tone;
  color?: string;
  /** Uses the filled glyph set (active tab, saved, liked, streak flame). */
  filled?: boolean;
  style?: TextStyle;
}

export function Icon({ name, size = 22, tone = 'ink', color, filled, style }: IconProps) {
  const toneColor = useToneColor(tone);
  return (
    <RNText
      accessible={false}
      importantForAccessibility="no"
      style={[
        {
          fontFamily: filled ? fontFamily.iconFilled : fontFamily.iconOutlined,
          fontSize: size,
          lineHeight: size,
          width: size,
          height: size,
          textAlign: 'center',
          color: color ?? toneColor,
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {String.fromCodePoint(glyphs[name])}
    </RNText>
  );
}
