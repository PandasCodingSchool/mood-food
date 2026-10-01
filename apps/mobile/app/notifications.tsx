// 2.0 Notifications: same API as v1 (list, mark one read, mark all read),
// grouped into Today / Earlier. Tapping opens the related screen when the
// type has an obvious home (orders → history, quests → quests).
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Button, IconTile, Screen, Text, useTheme, type IconName } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock, TopBar } from '../src/components/v2';
import { fetchNotifications, markAllRead, markOneRead, type AppNotification } from '../src/services/notifications';

const TYPE_STYLE: Record<AppNotification['type'], { icon: IconName; hue: number; route?: string }> = {
  order: { icon: 'receipt_long', hue: 260, route: '/history' },
  order_placed: { icon: 'shopping_bag', hue: 40, route: '/history' },
  quest_completed: { icon: 'military_tech', hue: 95, route: '/quests' },
  info: { icon: 'info', hue: 210 },
  promo: { icon: 'sell', hue: 350 },
  swiggy: { icon: 'link', hue: 30, route: '/swiggy-connect' },
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 2) return 'Just now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setItems((await fetchNotifications()).notifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const readAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllRead().catch(() => {});
  };

  const tap = async (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markOneRead(n.id).catch(() => {});
    }
    const route = TYPE_STYLE[n.type]?.route;
    if (route) router.push(route as never);
  };

  const unread = items.filter((n) => !n.read).length;
  const sections = [
    { title: 'Today', items: items.filter((n) => isToday(n.createdAt)) },
    { title: 'Earlier', items: items.filter((n) => !isToday(n.createdAt)) },
  ].filter((s) => s.items.length);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.acc} />}>
        <TopBar right={unread ? <Button label="Mark all read" variant="glass" size="sm" style={{ height: 34, borderRadius: 17 }} onPress={readAll} /> : null} />
        <View style={{ paddingHorizontal: space.page, paddingTop: 16, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text variant="display36" accessibilityRole="header">Notifications</Text>
          {unread ? <Text variant="bodyStrong14" tone="accText">{`${unread} new`}</Text> : null}
        </View>

        {loading ? (
          <LoadingBlock label="Loading" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : sections.length === 0 ? (
          <Text variant="body14" tone="ink2" align="center" style={{ padding: 40 }}>You're all caught up.</Text>
        ) : (
          sections.map((sec) => (
            <View key={sec.title}>
              <Text variant="label" tone="ink2" style={{ paddingHorizontal: space.page, paddingTop: 22, paddingBottom: 10 }}>{sec.title}</Text>
              <View style={{ paddingHorizontal: space.gutter, gap: 8 }}>
                {sec.items.map((n) => {
                  const s = TYPE_STYLE[n.type] ?? TYPE_STYLE.info;
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => void tap(n)}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}`}
                      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 14, paddingRight: 14, paddingLeft: 20, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: n.read ? colors.surf : colors.surf2 }}
                    >
                      {!n.read ? <View style={{ position: 'absolute', top: 16, left: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.acc }} /> : null}
                      <IconTile icon={s.icon} hue={s.hue} size={44} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                          <Text variant="bodyStrong14" style={{ flex: 1 }}>{n.title}</Text>
                          <Text variant="micro12" tone="ink2">{timeAgo(n.createdAt)}</Text>
                        </View>
                        {n.body ? <Text variant="caption13" tone="ink2" style={{ marginTop: 4 }}>{n.body}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </Screen>
    </View>
  );
}
