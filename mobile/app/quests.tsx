import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StatusBar, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import BottomNav from '../src/components/BottomNav';
import { fw, colors } from '../src/constants/theme';
import { fetchQuests, type Quest } from '../src/services/quests';

// 5.2 — Streaks & taste-discovery quests. Deliberately inject exploration
// data, fighting the recommender's collapse into the same 5 dishes.
export default function QuestsScreen() {
  const router = useRouter();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuests().then((q) => {
      setQuests(q);
      setLoading(false);
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 20, color: colors.navy }]}>Quests</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110, gap: 14 }} showsVerticalScrollIndicator={false}>
          {quests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
            const done = q.status === 'completed';
            return (
              <View
                key={q.key}
                style={{ padding: 16, borderRadius: 18, backgroundColor: '#fff', borderWidth: 2, borderColor: done ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.06)' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[fw(800), { fontSize: 15, color: colors.navy, flex: 1 }]}>{q.title}</Text>
                  {done && <Text style={{ fontSize: 18 }}>✅</Text>}
                </View>
                <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 4 }]}>{q.description}</Text>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginTop: 12 }}>
                  <LinearGradient
                    colors={done ? ['#22c55e', '#4ade80'] : ['#f97316', '#fbbf24']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ height: '100%', width: `${pct}%` }}
                  />
                </View>
                <Text style={[fw(700), { fontSize: 11, color: '#94a3b8', marginTop: 6 }]}>
                  {q.progress}/{q.target} {done ? '· Complete!' : ''}
                </Text>
              </View>
            );
          })}
          {quests.length === 0 && (
            <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 40 }]}>
              No active quests right now.
            </Text>
          )}
        </ScrollView>
      )}

      <BottomNav active="profile" />
    </View>
  );
}
