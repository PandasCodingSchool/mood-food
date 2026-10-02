// 2.0 History & saved. Same API as v1 (fetchHistory(all|ordered|saved),
// toggleSaved). Optional ?tab=ordered|saved.
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { DishImage, IconButton, Screen, SegmentedControl, Surface, Text, useTheme, useToast } from '@moodfood/ui';
import { AppTabBar, ErrorBlock, LoadingBlock, TopBar } from '../src/components/v2';
import { fetchHistory, toggleSaved, type HistoryItem } from '../src/services/history';

type Tab = 'all' | 'ordered' | 'saved';

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  if (days < 7) return `${d.toLocaleDateString('en-IN', { weekday: 'short' })} · ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function HistoryScreen() {
  const toast = useToast();
  const { colors, dark } = useTheme();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'saved' || params.tab === 'ordered' ? params.tab : 'all');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setItems(await fetchHistory(tab));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load your history');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const flipSaved = async (item: HistoryItem) => {
    const next = !item.saved;
    setItems((prev) => (tab === 'saved' && !next ? prev.filter((i) => i.id !== item.id) : prev.map((i) => (i.id === item.id ? { ...i, saved: next } : i))));
    try {
      await toggleSaved(item.id, next);
      toast(next ? 'Saved for later' : 'Removed from saved');
    } catch {
      void load();
    }
  };

  const empty = tab === 'saved' ? 'Nothing saved yet. Tap the bookmark on any pick and it lands here.' : tab === 'ordered' ? 'No orders yet.' : 'No history yet.';

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={<AppTabBar />} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.acc} />}>
        <TopBar title="Your food" />
        <SegmentedControl
          style={{ marginHorizontal: space.gutter, marginTop: 16 }}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All' },
            { value: 'ordered', label: 'Orders' },
            { value: 'saved', label: 'Saved' },
          ]}
        />
        {loading ? (
          <LoadingBlock label="Loading" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <Text variant="body14" tone="ink2" align="center" style={{ paddingHorizontal: 40, paddingTop: 60 }}>{empty}</Text>
        ) : (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: 12, gap: 10 }}>
            {items.map((it) => (
              <Surface key={it.id} radius={22} padding={12} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <DishImage height={64} radius={16} stripe={7} style={{ width: 64 }}>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 26 }} accessible={false}>{it.emoji}</Text>
                  </View>
                </DishImage>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="micro11" tone="ink2">{when(it.createdAt)}</Text>
                  <Text variant="bodyStrong14" numberOfLines={1} style={{ marginTop: 2 }}>{it.dishName}</Text>
                  <Text variant="micro12" tone="ink2" numberOfLines={1} style={{ marginTop: 5 }}>
                    {[it.ordered ? it.platform : 'Saved idea', it.priceInr ? `₹${Math.round(it.priceInr)}` : null, it.via].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <IconButton
                  icon="bookmark"
                  label={it.saved ? 'Remove from saved' : 'Save'}
                  variant="solid"
                  size={36}
                  square
                  filled={it.saved}
                  iconColor={it.saved ? colors.accText : undefined}
                  onPress={() => void flipSaved(it)}
                />
              </Surface>
            ))}
          </View>
        )}
      </Screen>
    </View>
  );
}
