// 2.0 Taste & allergies: diet, allergies, budget and cuisines (same API and
// ids as Settings). Allergies are hard filters in both recommendation engines.
// ?onboarding=<flow> → a setup step with "Later"; otherwise saves and goes back.
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Button, FilterChip, Icon, Screen, SegmentedControl, Text, useTheme, type IconName } from '@moodfood/ui';
import { LoadingBlock, TopBar } from '../src/components/v2';
import { ALLERGIES, BUDGETS, CUISINES, DEFAULT_PREFS, DIETS } from '../src/constants/preferences';
import { asSetupFlow, nextSetupStep, setupStepLabel } from '../src/constants/setup';
import { fetchPreferences, savePreferences, type UserPreferences } from '../src/services/preferences';
import { trackEvent } from '../src/utils/analytics';

type ListKey = 'diets' | 'allergies' | 'cuisines';

export default function PreferencesScreen() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const flow = asSetupFlow(onboarding);
  const { dark } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPreferences()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const done = () => {
    if (flow) router.replace(nextSetupStep('preferences', flow));
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await savePreferences(prefs);
      trackEvent('preferences_onboarding_completed', { allergies: prefs.allergies.length, diets: prefs.diets.length });
      done();
    } catch {
      setError('Could not save your preferences. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: ListKey, id: string) =>
    setPrefs((p) => ({ ...p, [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id] }));

  const section = (icon: IconName, title: string, hint: string, children: ReactNode) => (
    <View style={{ paddingTop: 24 }}>
      <View style={{ paddingHorizontal: space.page, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={19} tone="accText" />
        <Text variant="bodyStrong15">{title}</Text>
        <Text variant="caption12" tone="ink2" style={{ marginLeft: 'auto' }}>{hint}</Text>
      </View>
      {children}
    </View>
  );
  const chips = (key: ListKey, options: Array<{ id: string; label: string }>) => (
    <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <FilterChip key={o.id} label={o.label} selected={prefs[key].includes(o.id)} onPress={() => toggle(key, o.id)} />
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        {flow ? (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" tone="ink2">{setupStepLabel('preferences', flow)}</Text>
            <Button label="Later" variant="glass" size="sm" onPress={done} style={{ height: 34, borderRadius: 17 }} />
          </View>
        ) : (
          <TopBar title="Taste & allergies" />
        )}

        <View style={{ paddingHorizontal: space.page, paddingTop: flow ? 28 : 12 }}>
          <Text variant="display32" accessibilityRole="header">What should we know about how you eat?</Text>
          <Text variant="body15" tone="ink2" style={{ marginTop: 10 }}>
            Allergies are never suggested, whatever your mood. Change any of this later in Settings.
          </Text>
        </View>

        {loading ? (
          <LoadingBlock label="Loading" />
        ) : (
          <>
            {section('warning', 'Allergies', 'Never suggested', chips('allergies', ALLERGIES))}
            {section('eco', 'Diet', 'Pick any', chips('diets', DIETS))}
            {section(
              'payments',
              'Usual budget per meal',
              '',
              <SegmentedControl
                style={{ marginHorizontal: space.gutter }}
                options={BUDGETS}
                value={prefs.budget}
                onChange={(b) => setPrefs((p) => ({ ...p, budget: b }))}
              />,
            )}
            {section('restaurant', 'Favourite cuisines', 'Pick any', chips('cuisines', CUISINES))}
          </>
        )}

        {error ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 16 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 24, paddingBottom: 24 }}>
          <Button block loading={saving} disabled={loading} label={flow ? 'Save & continue' : 'Save'} iconRight={flow ? 'arrow_forward' : undefined} onPress={() => void save()} />
        </View>
      </Screen>
    </View>
  );
}
