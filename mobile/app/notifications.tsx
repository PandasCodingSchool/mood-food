import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { fw } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';
import { useTheme } from '../src/context/ThemeContext';
import { fetchNotifications, markAllRead, markOneRead, type AppNotification } from '../src/services/notifications';

const TYPE_META: Record<string, { icon: string; accent: string }> = {
  order:  { icon: '🛒', accent: '#f97316' },
  swiggy: { icon: '🍽️', accent: '#22c55e' },
  promo:  { icon: '🎟️', accent: '#7c3aed' },
  info:   { icon: '📣', accent: '#0891b2' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 2) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchNotifications();
      setItems(res.notifications);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllRead().catch(() => {});
  };

  const handleTap = async (item: AppNotification) => {
    if (!item.read) {
      setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
      await markOneRead(item.id).catch(() => {});
    }
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 18, lineHeight: 22, color: theme.text }}>←</Text>
          </TouchableOpacity>
          <Text style={[fw(900), { fontSize: 22, color: theme.text }]}>Notifications</Text>
          {unread > 0 && (
            <View style={{ backgroundColor: '#f97316', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={[fw(800), { fontSize: 11, color: '#fff' }]}>{unread}</Text>
            </View>
          )}
        </View>
        {unread > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={[fw(700), { fontSize: 13, color: '#f97316' }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 110, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#f97316']} />}
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 64, gap: 12 }}>
              <Text style={{ fontSize: 56 }}>🔔</Text>
              <Text style={[fw(800), { fontSize: 18, color: theme.text }]}>No notifications yet</Text>
              <Text style={[fw(600), { fontSize: 13, color: theme.subtext, textAlign: 'center' }]}>
                Order updates and Swiggy alerts will appear here
              </Text>
            </View>
          ) : (
            items.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META.info;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  onPress={() => handleTap(item)}
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: theme.card,
                    borderWidth: item.read ? 1 : 2,
                    borderColor: item.read ? theme.border : `${meta.accent}40`,
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <View style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: `${meta.accent}15`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[fw(item.read ? 700 : 800), { fontSize: 14, color: theme.text, flex: 1 }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {!item.read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.accent, marginLeft: 8, flexShrink: 0 }} />
                      )}
                    </View>
                    {item.body ? (
                      <Text style={[fw(600), { fontSize: 13, color: theme.subtext, lineHeight: 18 }]} numberOfLines={2}>
                        {item.body}
                      </Text>
                    ) : null}
                    <Text style={[fw(600), { fontSize: 11, color: theme.subtext, marginTop: 2 }]}>
                      {formatDate(item.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      <BottomNav active="profile" />
    </View>
  );
}
