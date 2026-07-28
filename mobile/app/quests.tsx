import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StatusBar, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Check, Flame, UtensilsCrossed, CalendarDays, Compass, Trophy } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors, gradients } from '../src/constants/theme';
import Screen from '../src/components/Screen';
import BottomNav from '../src/components/BottomNav';
import { fetchQuests, type Quest } from '../src/services/quests';

const QUEST_ICONS: Record<string, typeof Trophy> = {
  try_3_cuisines: UtensilsCrossed,
  mood_streak_7: CalendarDays,
  adventure_score: Compass,
};

function QuestIcon({ questKey, color }: { questKey: string; color: string }) {
  const Icon = QUEST_ICONS[questKey] ?? Trophy;
  return <Icon size={22} color={color} />;
}

// 5.2 — Streaks & taste-discovery quests. Deliberately inject exploration
// data, fighting the recommender's collapse into the same 5 dishes.
export default function QuestsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const q = await fetchQuests();
    setQuests(q);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const completedCount = quests.filter((q) => q.status === 'completed').length;
  const total = quests.length || 1;
  const overallPct = Math.min(100, Math.round((completedCount / total) * 100));
  const streak = quests.reduce((max, q) => Math.max(max, q.streakCount || 0), 0);

  return (
    <Screen>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />

      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 20, color: theme.text }]}>Quests</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110, gap: 18 }} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={gradients.orangeDeep}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 24,
              padding: 22,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOpacity: 0.1,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={[fw(700), { fontSize: 13, color: 'rgba(255,255,255,0.85)' }]}>Current streak</Text>
                <Text style={[fw(900), { fontSize: 34, color: '#fff', marginTop: 2 }]}>{streak} day{streak === 1 ? '' : 's'}</Text>
              </View>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Flame size={28} color="#fff" fill="#fff" />
              </View>
            </View>

            <View style={{ marginTop: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={[fw(700), { fontSize: 12, color: 'rgba(255,255,255,0.9)' }]}>Overall progress</Text>
                <Text style={[fw(800), { fontSize: 12, color: '#fff' }]}>{completedCount}/{quests.length} completed</Text>
              </View>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                <LinearGradient
                  colors={['#fff', '#ffe4c4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ height: '100%', width: `${overallPct}%` }}
                />
              </View>
            </View>
          </LinearGradient>

          <Text style={[fw(800), { fontSize: 16, color: theme.text, marginTop: 4 }]}>Active challenges</Text>

          {quests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
            const done = q.status === 'completed';
            const iconColor = done ? colors.green : colors.orange;

            return (
              <View
                key={q.key}
                style={{
                  padding: 18,
                  borderRadius: 20,
                  backgroundColor: theme.card,
                  borderWidth: 1.5,
                  borderColor: done ? 'rgba(34,197,94,0.35)' : theme.border,
                  shadowColor: '#000',
                  shadowOpacity: 0.04,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: done ? 'rgba(34,197,94,0.12)' : `${colors.orange}15`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <QuestIcon questKey={q.key} color={iconColor} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[fw(800), { fontSize: 15, color: theme.text }]}>{q.title}</Text>
                      {done ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 12,
                            backgroundColor: 'rgba(34,197,94,0.12)',
                          }}
                        >
                          <Check size={12} color={colors.green} />
                          <Text style={[fw(800), { fontSize: 10, color: colors.green }]}>Done</Text>
                        </View>
                      ) : (
                        <Text style={[fw(800), { fontSize: 12, color: colors.orange }]}>{pct}%</Text>
                      )}
                    </View>
                    <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 3, lineHeight: 17 }]}>
                      {q.description}
                    </Text>
                  </View>
                </View>

                <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.surface, overflow: 'hidden', marginTop: 16 }}>
                  <LinearGradient
                    colors={done ? ['#22c55e', '#4ade80'] : gradients.orange}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ height: '100%', width: `${pct}%` }}
                  />
                </View>
                <Text style={[fw(700), { fontSize: 11, color: theme.subtext, marginTop: 7 }]}>
                  {q.progress}/{q.target} {done ? '· Complete!' : 'to go'}
                </Text>
              </View>
            );
          })}

          {quests.length === 0 && (
            <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 24 }}>
              <Trophy size={48} color={theme.muted} />
              <Text style={[fw(800), { fontSize: 15, color: theme.text, marginTop: 16 }]}>No quests active</Text>
              <Text style={[fw(600), { fontSize: 13, color: theme.subtext, marginTop: 4, textAlign: 'center' }]}>
                Check back soon for new challenges and streak rewards.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <BottomNav active="quests" />
    </Screen>
  );
}
