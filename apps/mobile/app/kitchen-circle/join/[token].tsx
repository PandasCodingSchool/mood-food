import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Screen, Text } from '@moodfood/ui';
import { acceptInvite, KitchenCircleError } from '../../../src/features/kitchen-circle/api';
import { kc, KC_TAGLINE } from '../../../src/features/kitchen-circle/brand';
import { KcButton as Button, KcWordmark } from '../../../src/features/kitchen-circle/components';

/** Invitation link. Works only for the account with the invited phone or email; sign in first if needed. */
export default function KitchenCircleJoinScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const join = async () => {
    setBusy(true); setError(null);
    try { await acceptInvite(token); router.replace('/kitchen-circle' as never); }
    catch (err) {
      if (err instanceof KitchenCircleError && err.status === 401) setNeedsSignIn(true);
      setError(err instanceof Error ? err.message : 'Could not join this KitchenCircle.');
    } finally { setBusy(false); }
  };

  return <View style={{ flex: 1 }}><StatusBar style="dark" /><Screen>
    <View style={{ flex: 1, padding: space.gutter, justifyContent: 'center', gap: 18 }}>
      <KcWordmark size={30} />
      <Text variant="display36">You're invited to plan meals together.</Text>
      <Text variant="body15" color={kc.mutedInk}>{KC_TAGLINE} Join with the phone number or email this invite was sent to.</Text>
      {error ? <Text variant="body14" color={kc.mirchi}>{needsSignIn ? 'Sign in first, then open this link again.' : error}</Text> : null}
      {needsSignIn ? <Button label="Sign in" block onPress={() => router.push('/login')} /> : <Button label="Join KitchenCircle" block loading={busy} onPress={() => void join()} />}
    </View>
  </Screen></View>;
}
