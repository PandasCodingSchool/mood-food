// 2.0 Settings: food preferences (same API and ids as v1 profile; autosaved,
// debounced) plus account. Only settings the backend stores are shown.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Button, FilterChip, ListRow, Screen, SegmentedControl, Surface, Text, useTheme } from '@moodfood/ui';
import { LoadingBlock, PoweredBySwiggy, TopBar } from '../src/components/v2';
import { ALLERGIES, BUDGETS, CUISINES, DEFAULT_PREFS, DIETS } from '../src/constants/preferences';
import { deleteAccount, fetchCurrentUser, logout, type AuthUser } from '../src/services/auth';
import { fetchPreferences, savePreferences, type UserPreferences } from '../src/services/preferences';

type ListKey = 'diets' | 'allergies' | 'cuisines';

export default function SettingsScreen() {
  const router = useRouter();
  const { dark } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Inline confirm (Alert.alert is a no-op on web).
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const [deleteError, setDeleteError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([fetchPreferences().catch(() => DEFAULT_PREFS), fetchCurrentUser().catch(() => null)])
      .then(([p, u]) => {
        setPrefs(p);
        setUser(u);
      })
      .finally(() => setLoading(false));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const persist = (next: UserPreferences) => {
    setPrefs(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus('saving');
      try {
        await savePreferences(next);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 600);
  };

  const toggle = (key: ListKey, id: string) => {
    const list = prefs[key];
    persist({ ...prefs, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };

  const section = (title: string, children: ReactNode) => (
    <>
      <Text variant="label" tone="ink2" style={{ paddingHorizontal: space.page, paddingTop: 24, paddingBottom: 10 }}>{title}</Text>
      {children}
    </>
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
        <TopBar
          title="Settings"
          right={
            status === 'idle' ? null : (
              <Text variant="micro12" tone={status === 'error' ? 'ink' : 'ink2'} accessibilityLiveRegion="polite">
                {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Not saved'}
              </Text>
            )
          }
        />
        {loading ? (
          <LoadingBlock label="Loading" />
        ) : (
          <>
            {section('Diet', chips('diets', DIETS))}
            {section('Allergies', chips('allergies', ALLERGIES))}
            {section(
              'Usual budget per meal',
              <SegmentedControl
                style={{ marginHorizontal: space.gutter }}
                options={BUDGETS}
                value={prefs.budget}
                onChange={(b) => persist({ ...prefs, budget: b })}
              />,
            )}
            {section('Favourite cuisines', chips('cuisines', CUISINES))}
            {section(
              'Account',
              <Surface style={{ marginHorizontal: space.gutter, paddingHorizontal: 6, paddingVertical: 2 }}>
                <ListRow title="Swiggy account" meta={user?.swiggyLinked ? 'Connected' : 'Not linked'} onPress={() => router.push('/swiggy-connect')} divider />
                {user?.email ? (
                  <ListRow
                    title="Email"
                    subtitle={user.email}
                    meta={user.emailVerified ? 'Verified' : 'Verify'}
                    onPress={user.emailVerified ? undefined : () => router.push('/verify-email')}
                    divider
                  />
                ) : null}
                {user && !user.isGuest ? (
                  <ListRow
                    title="Log out"
                    chevron={false}
                    onPress={async () => {
                      await logout();
                      router.replace('/login');
                    }}
                  />
                ) : (
                  <ListRow title="Log in or sign up" onPress={() => router.push('/login')} />
                )}
              </Surface>,
            )}
            {user ? (
              <View style={{ paddingHorizontal: space.gutter, paddingTop: 14 }}>
                {deleteStep === 'idle' ? (
                  <Button block variant="ghost" size="md" label="Delete account" onPress={() => setDeleteStep('confirm')} />
                ) : (
                  <Surface padding={16} style={{ gap: 12 }}>
                    <Text variant="bodyStrong15">Delete your account?</Text>
                    <Text variant="body13" tone="ink2">
                      This permanently deletes your profile, preferences, history, saved dishes, quests and taste data, and unlinks Swiggy. It can't be undone.
                    </Text>
                    {deleteError ? <Text variant="caption13" color={palette.danger}>{deleteError}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button variant="glass" size="md" label="Cancel" style={{ flex: 1 }} disabled={deleteStep === 'deleting'} onPress={() => { setDeleteStep('idle'); setDeleteError(''); }} />
                      <Button
                        variant="ink"
                        size="md"
                        label={deleteStep === 'deleting' ? 'Deleting…' : 'Delete forever'}
                        style={{ flex: 1 }}
                        disabled={deleteStep === 'deleting'}
                        onPress={async () => {
                          setDeleteStep('deleting');
                          setDeleteError('');
                          try {
                            await deleteAccount();
                            router.replace('/login');
                          } catch (e) {
                            setDeleteError(e instanceof Error ? e.message : 'Could not delete your account.');
                            setDeleteStep('confirm');
                          }
                        }}
                      />
                    </View>
                  </Surface>
                )}
              </View>
            ) : null}
            <PoweredBySwiggy style={{ paddingTop: 24 }} />
            <Text variant="micro12" tone="ink2" align="center" style={{ paddingTop: 8 }}>MoodFood 2.0</Text>
          </>
        )}
      </Screen>
    </View>
  );
}
