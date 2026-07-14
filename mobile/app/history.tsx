import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';
import { fetchHistory, toggleSaved, type HistoryItem } from '../src/services/history';

type Tab = 'all' | 'saved' | 'ordered';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchHistory(tab);
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleToggleSaved = async (item: HistoryItem) => {
    const next = !item.saved;
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, saved: next } : x));
    try {
      await toggleSaved(item.id, next);
    } catch {
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, saved: item.saved } : x));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        <Text style={[fw(900), { fontSize: 24, color: colors.navy }]}>History</Text>
        <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', marginTop: 4 }]}>Your past picks & saved meals</Text>
      </View>

      <View style={{ flexDirection: 'row', margin: 24, marginBottom: 0, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 14, padding: 3 }}>
        {(['all', 'saved', 'ordered'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: tab === t ? '#fff' : 'transparent', alignItems: 'center' }}
          >
            <Text style={[fw(800), { fontSize: 13, color: tab === t ? colors.navy : '#94a3b8', textTransform: 'capitalize' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 110, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.orange]} />}
        >
          {items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 48, gap: 12 }}>
              <Text style={{ fontSize: 56 }}>🍽️</Text>
              <Text style={[fw(800), { fontSize: 17, color: colors.navy }]}>
                {tab === 'saved' ? 'No saved meals yet' : tab === 'ordered' ? 'No orders yet' : 'No history yet'}
              </Text>
              <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', textAlign: 'center' }]}>
                Play a game and place an order to see it here
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.id} style={{ backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
                <LinearGradient
                  colors={[item.gradientStart, item.gradientEnd] as [string, string]}
                  style={{ padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Text style={{ fontSize: 36 }}>{item.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[fw(800), { fontSize: 16, color: '#fff' }]} numberOfLines={1}>{item.dishName}</Text>
                    <Text style={[fw(600), { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }]}>{item.cuisine}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleSaved(item)}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 16 }}>{item.saved ? '❤️' : '🤍'}</Text>
                  </TouchableOpacity>
                </LinearGradient>
                <View style={{ padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {item.priceInr > 0 && (
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(249,115,22,0.08)' }}>
                        <Text style={[fw(700), { fontSize: 11, color: colors.orange }]}>₹{item.priceInr}</Text>
                      </View>
                    )}
                    {item.platform && (
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)' }}>
                        <Text style={[fw(700), { fontSize: 11, color: '#64748b' }]}>{item.platform}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[fw(600), { fontSize: 11, color: '#94a3b8' }]}>{formatDate(item.createdAt)}</Text>
                    {item.ordered && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green, marginLeft: 4 }} />}
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <BottomNav active="history" />
    </View>
  );
}
