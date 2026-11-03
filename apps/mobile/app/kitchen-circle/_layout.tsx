import { useMemo } from 'react';
import { Stack } from 'expo-router';
import { ThemeOverride, useTheme } from '@moodfood/ui';
import { kitchenCircleTheme } from '../../src/features/kitchen-circle/brand';

/** Every KitchenCircle screen renders in the KitchenCircle brand (Direction A), whatever the MoodFood theme is. */
export default function KitchenCircleLayout() {
  const base = useTheme();
  const theme = useMemo(() => kitchenCircleTheme(base), [base]);
  return (
    <ThemeOverride theme={theme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' }, animation: 'slide_from_right' }} />
    </ThemeOverride>
  );
}
