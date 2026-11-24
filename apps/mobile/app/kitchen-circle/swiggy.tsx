// KitchenCircle's own Swiggy connection, for people who only use KitchenCircle.
// It is the same per-user Swiggy link MoodFood uses (one OAuth, one token), with
// KitchenCircle wording, a return to KitchenCircle and the Instamart delivery address.
// Swiggy tokens last 5 days with no refresh, so it shows the expiry and offers a reconnect.
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Icon, Screen, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { ErrorBlock, PoweredBySwiggy, TopBar } from '../../src/components/v2';
import { fetchCurrentUser } from '../../src/services/auth';
import { getHeaders } from '../../src/services/apiBase';
import { initiateSwiggyOAuth, unlinkSwiggy } from '../../src/services/swiggy';
import { listDeliveryAddresses, listKitchenCircleHouseholds, setDeliveryAddress } from '../../src/features/kitchen-circle/api';
import { kc } from '../../src/features/kitchen-circle/brand';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const PERMS: Array<{ icon: IconName; t: string; d: string }> = [
  { icon: 'storefront', t: 'Live Instamart products and prices', d: 'Your grocery list becomes real packs at real prices' },
  { icon: 'location_on', t: 'Your saved addresses', d: 'Pick where the household’s groceries go' },
  { icon: 'shopping_bag', t: 'Place grocery orders', d: 'Only after you check the cart and tap Place order' },
];
const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;
const formatExpiry = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function KitchenCircleSwiggyScreen() {
  const router = useRouter();
  const { dark } = useTheme();
  const { householdId } = useLocalSearchParams<{ householdId?: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const [linked, setLinked] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [owner, setOwner] = useState(true);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Array<{ id: string; label: string; tag?: string | null }> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const user = await fetchCurrentUser();
      const isLinked = !!user?.swiggyLinked;
      setLinked(isLinked);
      setExpiresAt(user?.swiggyExpiresAt ?? null);
      if (isLinked) setConnecting(false);
      if (householdId) setOwner((await listKitchenCircleHouseholds()).find((h) => h.household.id === householdId)?.role === 'owner');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check your Swiggy connection');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { void check(); }, [check]));
  // Back from Swiggy's sign-in (another app or browser tab): look again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    const onMessage = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === 'swiggy-oauth') void check(); };
    const win = Platform.OS === 'web' ? (globalThis as unknown as Window) : null;
    win?.addEventListener('message', onMessage);
    return () => { sub.remove(); win?.removeEventListener('message', onMessage); };
  }, [check]);

  const expiringSoon = linked && !!expiresAt && new Date(expiresAt).getTime() - Date.now() < EXPIRING_SOON_MS;

  const connect = async () => {
    setConnecting(true); setError(null);
    try {
      await Linking.openURL(await initiateSwiggyOAuth(await getHeaders(), 'kitchen-circle'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the Swiggy connection');
      setConnecting(false);
    }
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(null); }
  };

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} title="Swiggy & Instamart" subtitle="For your KitchenCircle groceries" />
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 12, paddingBottom: 48 }}>
      {loading ? <KcLoader label="Checking Swiggy" /> : <>
        <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: linked ? kc.curryLeaf : kc.sand }}>
              <Icon name={linked ? 'check' : 'link'} size={22} color={linked ? kc.chawal : kc.kadhai} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="display26" accessibilityRole="header">{linked ? 'Swiggy is connected' : 'Connect Swiggy'}</Text>
              <Text variant="caption13" tone="ink2">{linked ? 'KitchenCircle builds your carts from live Instamart products.' : 'Turn your grocery list into a real Instamart cart.'}</Text>
            </View>
          </View>
          {linked && expiresAt ? <Text variant="caption13" color={expiringSoon ? kc.mirchi : undefined} tone={expiringSoon ? undefined : 'ink2'}>
            {expiringSoon ? 'Expires soon' : 'Connected until'} {formatExpiry(expiresAt)}. Swiggy asks you to sign in again every 5 days.
          </Text> : null}
          {!owner ? <Text variant="caption13" tone="ink2">Carts use the household owner’s Swiggy account, so only the owner needs to connect. Connecting yours is fine too — it’s used if you start your own KitchenCircle.</Text> : null}
        </Surface>

        <Surface radius={20} style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
          {PERMS.map((p) => <View key={p.t} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: kc.leafTint, alignItems: 'center', justifyContent: 'center' }}><Icon name={p.icon} size={20} color={kc.curryLeafDeep} /></View>
            <View style={{ flex: 1 }}><Text variant="bodyStrong15">{p.t}</Text><Text variant="caption13" tone="ink2" style={{ marginTop: 2 }}>{p.d}</Text></View>
          </View>)}
        </Surface>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4 }}>
          <Icon name="lock" size={16} tone="ink2" />
          <Text variant="caption13" tone="ink2" style={{ flex: 1 }}>We never see card details. Nothing is ordered without your tap.</Text>
        </View>

        {error ? <ErrorBlock message={error} /> : null}
        {notice ? <Text variant="caption13" tone="accText" accessibilityLiveRegion="polite">{notice}</Text> : null}

        {!linked || expiringSoon ? <Button label={connecting ? 'Waiting for Swiggy…' : linked ? 'Reconnect Swiggy' : 'Connect Swiggy'} iconLeft="link" block loading={connecting} onPress={() => void connect()} /> : null}
        {connecting ? <>
          <Text variant="caption13" tone="ink2" align="center">Sign in on Swiggy, then come back here. We’ll pick it up automatically.</Text>
          <Button label="I’ve signed in — check again" size="md" variant="glass" block onPress={() => void check()} />
        </> : null}

        {linked && householdId && owner ? <Surface radius={18} style={{ padding: 14, gap: 8 }}>
          <Text variant="bodyStrong15">Where should groceries go?</Text>
          {addresses ? addresses.length ? addresses.map((a) => <Button key={a.id} label={`${a.tag ? `${a.tag} · ` : ''}${a.label}`} size="sm" variant="glass" block loading={busy === a.id}
            onPress={() => void run(a.id, async () => { await setDeliveryAddress(householdId, a.id, a.label); setAddresses(null); setNotice(`Groceries will go to ${a.label}.`); })} />)
            : <Text variant="caption13" tone="ink2">No saved addresses on Swiggy yet. Add one in the Swiggy app, then check again.</Text>
            : <Button label="Choose delivery address" size="sm" variant="glass" iconLeft="location_on" loading={busy === 'addresses'}
              onPress={() => void run('addresses', async () => setAddresses(await listDeliveryAddresses(householdId)))} />}
        </Surface> : null}

        {linked ? <>
          <Button label="Back to KitchenCircle" block onPress={leave} />
          <Button label="Disconnect Swiggy" size="md" variant="outline" block loading={busy === 'unlink'}
            onPress={() => void run('unlink', async () => { await unlinkSwiggy(await getHeaders()); setLinked(false); setNotice('Disconnected. If you also use MoodFood, it’s disconnected there too.'); })} />
        </> : null}
        <PoweredBySwiggy style={{ paddingTop: 6 }} />
      </>}
    </ScrollView>
  </Screen></View>;
}
