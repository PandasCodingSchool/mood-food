// Shared building blocks for MoodFood 2.0 screens (on top of @moodfood/ui).
import type { ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@moodfood/tokens';
import { Button, IconButton, TabBar, Text, useTheme } from '@moodfood/ui';

const LOGO = require('../../../assets/moodfood-logo.png');

/** White pill with the cropped wordmark (home / onboarding header). */
export function LogoPill() {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="MoodFood"
      style={{ width: 70, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 8px 18px -10px rgba(0,0,0,0.4)' }}
    >
      <View style={{ width: 56, height: 32, overflow: 'hidden' }}>
        <Image source={LOGO} style={{ position: 'absolute', width: 160, height: 160, left: -56, top: -34 }} />
      </View>
    </View>
  );
}

/** Square white logo tile (launch, login, Swiggy connect). */
export function LogoTile({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0px 20px 40px -20px rgba(0,0,0,0.5)' }}>
      <Image source={LOGO} style={{ width: size - 4, height: size - 4 }} resizeMode="contain" accessibilityLabel="MoodFood" />
    </View>
  );
}

const TABS = [
  { key: '/home', label: 'Home', icon: 'home' },
  { key: '/recommendations', label: 'For you', icon: 'auto_awesome' },
  { key: '/games', label: 'Play', icon: 'stadia_controller' },
  { key: '/profile', label: 'You', icon: 'person' },
] as const;

/** Floating tab bar wired to the app routes; the centre button opens the check-in. */
export function AppTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <TabBar
      tabs={[...TABS] as never}
      active={pathname}
      onTabPress={(key) => key !== pathname && router.replace(key as never)}
      onCenterPress={() => router.push({ pathname: '/mood-checkin', params: { next: pathname } })}
    />
  );
}

/** Back button + centred title, used by sub-screens. */
export function TopBar({ title, subtitle, onBack, right }: { title?: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.gutter, paddingTop: 6 }}>
      <IconButton icon="arrow_back" label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')))} />
      <View style={{ alignItems: 'center', flex: 1 }}>
        {title ? <Text variant="bodyStrong16" accessibilityRole="header">{title}</Text> : null}
        {subtitle ? <Text variant="micro12" tone="ink2">{subtitle}</Text> : null}
      </View>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/** Sticky bottom action bar that fades into the solid sheet colour. */
export function BottomBar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
      <LinearGradient colors={['rgba(0,0,0,0)', colors.solid]} locations={[0, 0.38]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space.gutter, paddingTop: 24, paddingBottom: Math.max(30, insets.bottom + 12) }}>
        {children}
      </View>
    </View>
  );
}

export function LoadingBlock({ label, style }: { label: string; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 14 }, style]} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.acc} size="large" />
      <Text variant="label" tone="ink2">{label}</Text>
    </View>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 14 }}>
      <Text variant="bodyStrong16" align="center">Something went sideways</Text>
      {/* Raw messages can be technical; only show them in development. */}
      <Text variant="body13" tone="ink2" align="center">{__DEV__ ? message : 'Check your connection and try again.'}</Text>
      {onRetry ? <Button label="Try again" variant="glass" size="md" onPress={onRetry} /> : null}
    </View>
  );
}
export { PoweredBySwiggy } from './PoweredBySwiggy';
export { CODE_LENGTH, CodeInput } from './CodeInput';
