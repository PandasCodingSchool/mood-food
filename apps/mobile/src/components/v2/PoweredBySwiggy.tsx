// "Powered by Swiggy" attribution, required by the Swiggy partnership.
// Shown on entry screens and every ordering surface.
//
// Text lockup in Swiggy's brand orange. If Swiggy's partner kit supplies an
// official "Powered by Swiggy" logo, swap the wordmark <Text> below for an
// <Image> of that asset — don't redraw their logo by hand.
import { View, type ViewStyle } from 'react-native';
import { fontFamily, palette } from '@moodfood/tokens';
import { Text } from '@moodfood/ui';

export function PoweredBySwiggy({ size = 'md', onDark, style }: { size?: 'sm' | 'md'; onDark?: boolean; style?: ViewStyle }) {
  const sm = size === 'sm';
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Powered by Swiggy"
      style={[{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 5 }, style]}
    >
      <Text variant={sm ? 'micro11' : 'micro12'} tone={onDark ? undefined : 'ink2'} color={onDark ? 'rgba(255,255,255,0.75)' : undefined}>
        Powered by
      </Text>
      <Text
        variant={sm ? 'chip12' : 'bodyStrong15'}
        color={palette.swiggy}
        style={{ fontFamily: fontFamily.displayHeavy, letterSpacing: -0.2 }}
      >
        Swiggy
      </Text>
    </View>
  );
}
