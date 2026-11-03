import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Screen, Text, ThemeOverride, useTheme } from '@moodfood/ui';
import { getPublicCookView, speakFromCookLink, type CookLanguage, type CookView } from '../../src/features/kitchen-circle/api';
import { kc, kitchenCircleTheme } from '../../src/features/kitchen-circle/brand';
import { KcLoader, KcWordmark } from '../../src/features/kitchen-circle/components';
import { CookViewPanel } from '../../src/features/kitchen-circle/cook-view';

/** Public cook page opened from a WhatsApp/SMS link. No account needed; the link can be revoked or expire. */
export default function CookLinkPage() {
  const base = useTheme();
  const theme = useMemo(() => kitchenCircleTheme(base), [base]);
  return <ThemeOverride theme={theme}><CookLinkContent /></ThemeOverride>;
}

function CookLinkContent() {
  const params = useLocalSearchParams<{ token: string }>();
  // Messaging apps sometimes glue the message onto the link ("…/cook/<token> Aloo Paratha for 1"): keep just the token.
  const token = /^[A-Za-z0-9_-]{20,64}/.exec(decodeURIComponent(String(params.token ?? '')).trim())?.[0] ?? '';
  const [view, setView] = useState<CookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (opts: { language?: CookLanguage; transliterate?: boolean } = {}) => {
    if (!token) { setError('This link looks incomplete — ask for a fresh one.'); return; }
    setBusy(true);
    try { setView(await getPublicCookView(token, opts)); setError(null); }
    catch (err) {
      const status = (err as { status?: number }).status;
      setError(status === 404 ? 'This link has expired or was turned off — ask for a fresh one.' : status === 400 ? 'This link looks incomplete — ask for a fresh one.' : 'This cook link could not be opened. Check your connection and try again.');
    }
    finally { setBusy(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return <View style={{ flex: 1 }}><StatusBar style="dark" /><Screen>
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 48 }}>
      <View style={{ paddingTop: 12 }}><KcWordmark size={24} /></View>
      {error ? <View style={{ gap: 8, paddingTop: 24 }}>
        <Text variant="display26">This link isn't working</Text>
        <Text variant="body15" color={kc.mutedInk}>{error}</Text>
      </View> : !view ? <KcLoader label="Opening the menu" /> : <CookViewPanel view={view} busy={busy}
        speak={(date, part, index) => speakFromCookLink(token, { date, part, index, language: view.language })}
        onLanguage={(language) => void load({ language, transliterate: view.transliterate })}
        onTransliterate={(transliterate) => void load({ language: view.language, transliterate })} />}
    </ScrollView>
  </Screen></View>;
}
