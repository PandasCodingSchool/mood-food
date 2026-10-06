// 2.0 Swiggy connect: real OAuth (opens Swiggy in the browser, re-checks on
// return), saves the first address for ordering, supports unlinking.
// Swiggy tokens last 5 days with no refresh, so a linked account shows its
// expiry and offers a reconnect in the last day.
// ?onboarding=1 → "Step 2 of 2" with "Later", continuing to the check-in.
import { useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Button, Icon, Screen, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { LogoTile, PoweredBySwiggy, TopBar } from '../src/components/v2';
import { fetchCurrentUser } from '../src/services/auth';
import { fetchAddresses, saveAddressId } from '../src/services/aiRecommendations';
import { getHeaders } from '../src/services/apiBase';
import { initiateSwiggyOAuth, unlinkSwiggy } from '../src/services/swiggy';
import { trackEvent } from '../src/utils/analytics';

const PERMS: Array<{ icon: IconName; t: string; d: string }> = [
  { icon: 'history', t: 'Read order history', d: 'So picks start smart on day one' },
  { icon: 'location_on', t: 'Use saved addresses', d: 'Home, work, that friend’s place' },
  { icon: 'shopping_bag', t: 'Place orders for you', d: 'Only when you tap Place order' },
];

const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

const formatExpiry = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function SwiggyConnectScreen() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = onboarding === '1';
  const { colors, dark } = useTheme();
  const [linked, setLinked] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      const user = await fetchCurrentUser();
      const isLinked = !!user?.swiggyLinked;
      setLinked(isLinked);
      setExpiresAt(user?.swiggyExpiresAt ?? null);
      if (isLinked) {
        setConnecting(false);
        const addresses = await fetchAddresses();
        if (addresses.length > 0) await saveAddressId(addresses[0].id);
      }
    } catch {
      setLinked(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkStatus();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void checkStatus());
    return () => sub.remove();
  }, []);

  const expiringSoon = linked && !!expiresAt && new Date(expiresAt).getTime() - Date.now() < EXPIRING_SOON_MS;

  const done = () => {
    if (isOnboarding) router.replace({ pathname: '/mood-checkin', params: { next: '/recommendations' } });
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const connect = async () => {
    setConnecting(true);
    setError(null);
    trackEvent('swiggy_connect_started');
    try {
      const url = await initiateSwiggyOAuth(await getHeaders());
      await Linking.openURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Swiggy connection');
      setConnecting(false);
    }
  };

  const unlink = async () => {
    setError(null);
    try {
      await unlinkSwiggy(await getHeaders());
      setLinked(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlink Swiggy');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        {isOnboarding ? (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" tone="ink2">Step 2 of 2</Text>
            <Button label="Later" variant="glass" size="sm" onPress={done} style={{ height: 34, borderRadius: 17 }} />
          </View>
        ) : (
          <TopBar title="Swiggy account" />
        )}

        <View style={{ marginTop: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <LogoTile size={96} />
          <View style={{ width: 70, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.ink2, opacity: 0.5 }} />
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: linked ? palette.success : colors.solid, borderWidth: 1, borderColor: colors.line }}>
              <Icon name={linked ? 'check' : 'link'} size={20} color={linked ? palette.white : colors.ink} />
            </View>
          </View>
          <View
            accessibilityRole="image"
            accessibilityLabel="Swiggy"
            style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: palette.swiggy, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 20px 40px -18px rgba(252,128,25,0.7)' }}
          >
            <Text variant="display26" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 22 }} color={palette.white}>Swiggy</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: space.page, paddingTop: 30 }}>
          <Text variant="display32" align="center" accessibilityRole="header">
            {linked ? 'You’re connected.' : 'Connect Swiggy to order in one tap'}
          </Text>
          <Text variant="body15" tone="ink2" align="center" style={{ marginTop: 10 }}>
            {linked
              ? 'Your past orders are already teaching MoodFood what you like.'
              : 'We use your order history to learn your taste, then place orders for you.'}
          </Text>
          {linked && expiresAt ? (
            <Text variant="caption12" tone={expiringSoon ? undefined : 'ink2'} color={expiringSoon ? palette.danger : undefined} align="center" style={{ marginTop: 8 }}>
              {expiringSoon ? 'Expires soon' : 'Connected until'} {formatExpiry(expiresAt)}. Swiggy asks you to sign in again every 5 days.
            </Text>
          ) : null}
        </View>

        <Surface style={{ marginHorizontal: space.gutter, marginTop: 24, paddingHorizontal: 16, paddingVertical: 6 }}>
          {PERMS.map((p) => (
            <View key={p.t} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={p.icon} size={21} tone="accText" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong15">{p.t}</Text>
                <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>{p.d}</Text>
              </View>
              <Icon name="check_circle" size={22} filled color={linked ? palette.success : colors.track} />
            </View>
          ))}
        </Surface>

        <View style={{ marginHorizontal: space.page, marginTop: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Icon name="lock" size={17} tone="ink2" />
          <Text variant="caption12" tone="ink2" style={{ flex: 1 }}>We never see card details. Disconnect any time in Settings.</Text>
        </View>

        {error ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 22, gap: 10 }}>
          <Button
            block
            loading={loading}
            label={connecting ? 'Waiting for Swiggy…' : expiringSoon ? 'Reconnect Swiggy' : linked ? 'Continue' : 'Connect Swiggy'}
            onPress={linked && !expiringSoon ? done : connect}
          />
          {expiringSoon ? <Button block variant="outline" size="md" label="Continue" onPress={done} /> : null}
          {linked && !isOnboarding ? <Button block variant="outline" size="md" label="Disconnect Swiggy" onPress={unlink} /> : null}
          {connecting ? (
            <Text variant="caption12" tone="ink2" align="center">Finish in the browser, then come back. We'll pick it up automatically.</Text>
          ) : null}
        </View>
        <PoweredBySwiggy style={{ paddingTop: 10, paddingBottom: 24 }} />
      </Screen>
    </View>
  );
}
